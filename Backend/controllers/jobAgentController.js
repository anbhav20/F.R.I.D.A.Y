import JobPreference from "../models/jobpreferencemodel.js";
import JobApplication from "../models/jobapplicationmodel.js";
import AIApplyProfile from "../models/aiapplyprofilemodel.js";
import User from "../models/usermodel.js";
import {
  buildApplicationPackage,
  buildApplicationWorkflow,
  discoverJobsForPreference,
  isAtsAutomationSupported,
  makeDuplicateKey,
  optimizeResumeSummary,
  scoreJob,
} from "../utils/jobAgent.js";
import {
  attemptApplicationSubmit,
  closeApplicationAutomation,
  startApplicationAutomation,
} from "../utils/jobBrowserAutomation.js";
import {
  buildApplySuccessReport,
  buildDailyReport,
  sendDailyReportEmail,
} from "../utils/jobEmailReport.js";

const automationTasks = new Map();

const createTaskId = () =>
  `apply_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const updateTask = (taskId, patch = {}) => {
  const current = automationTasks.get(taskId) || {};
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date(),
  };
  automationTasks.set(taskId, next);
  return next;
};

const preferenceFields = [
  "preferredRoles",
  "skills",
  "experienceLevel",
  "salaryExpectation",
  "preferredLocations",
  "workMode",
  "engagementType",
  "industries",
  "companyTypes",
  "workTiming",
  "preferredPlatforms",
  "atsCompanySlugs",
  "savedCompanies",
  "blacklistedCompanies",
  "emailReportsEnabled",
  "minimumMatchScore",
  "resumeVersions",
];

const applyProfileFields = [
  "fullName",
  "email",
  "phone",
  "github",
  "linkedin",
  "portfolio",
  "resumeFilePath",
  "experienceSummary",
  "currentLocation",
  "workAuthorization",
  "consentToAutofill",
  "onboardingCompleted",
];

const pickPreferenceUpdates = (body = {}) =>
  Object.fromEntries(
    Object.entries(body || {}).filter(([key]) =>
      preferenceFields.includes(key),
    ),
  );

const getOrCreatePreference = async (userId) => {
  // findOneAndUpdate with upsert — atomic hai, duplicate nahi hoga
  return await JobPreference.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        user: userId,
        preferredPlatforms: [
          "LinkedIn",
          "Naukri",
          "Internshala",
          "Indeed",
          "Remote Jobs",
        ],
        atsCompanySlugs: [],
        resumeVersions: [
          { name: "Default Resume", content: "", isDefault: true },
        ],
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

const getOrCreateApplyProfile = async (userId) => {
  const user = await User.findById(userId).lean();
  return AIApplyProfile.findOneAndUpdate(
    { user: userId },
    {
      $setOnInsert: {
        user: userId,
        email: user?.email || "",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

const pickApplyProfileUpdates = (body = {}) =>
  Object.fromEntries(
    Object.entries(body || {}).filter(([key]) =>
      applyProfileFields.includes(key),
    ),
  );

const sendApplySuccessEmail = async ({ userId, application }) => {
  try {
    const [user, preference] = await Promise.all([
      User.findById(userId).lean(),
      JobPreference.findOne({ user: userId }).lean(),
    ]);
    if (preference?.emailReportsEnabled === false) return { skipped: true };
    return await sendDailyReportEmail({
      to: user?.email,
      report: buildApplySuccessReport(application),
    });
  } catch (error) {
    console.warn("[ApplySuccessEmail] skipped:", error.message);
    return { skipped: true, reason: error.message };
  }
};

export const getDashboard = async (req, res) => {
  try {
    const [preference, applyProfile, rawApplications] = await Promise.all([
      getOrCreatePreference(req.user.id),
      getOrCreateApplyProfile(req.user.id),
      JobApplication.find({ user: req.user.id })
        .sort({ priorityScore: -1, createdAt: -1 })
        .lean(),
    ]);
    const applications = rawApplications.map((app) => {
      const supportedPlatform = isAtsAutomationSupported(app);
      return {
        ...app,
        supportedPlatform,
        applyClassification: supportedPlatform
          ? "AI Apply Ready"
          : app.applicationWorkflow?.platform === "Workday" ||
              app.platform === "Workday"
            ? "Guided Apply"
            : "External Apply",
      };
    });

    const stats = applications.reduce(
      (acc, app) => {
        acc.total += 1;
        acc.byStatus[app.status] = (acc.byStatus[app.status] || 0) + 1;
        if (app.status === "Applied") acc.applied += 1;
        if (app.status === "Application Prepared") acc.prepared += 1;
        if (app.supportedPlatform) acc.supported += 1;
        if (app.status === "Interview Scheduled") acc.interviews += 1;
        return acc;
      },
      {
        total: 0,
        applied: 0,
        prepared: 0,
        supported: 0,
        interviews: 0,
        byStatus: {},
      },
    );

    return res.status(200).json({
      preference,
      applyProfile: applyProfile.toSafeObject(),
      applications,
      stats,
    });
  } catch (error) {
    console.error("getDashboard error:", error);
    return res
      .status(500)
      .json({ message: "Failed to load job dashboard.", success: false });
  }
};

export const getApplyProfile = async (req, res) => {
  try {
    const applyProfile = await getOrCreateApplyProfile(req.user.id);
    return res
      .status(200)
      .json({ success: true, applyProfile: applyProfile.toSafeObject() });
  } catch (error) {
    console.error("getApplyProfile error:", error);
    return res
      .status(500)
      .json({ message: "Failed to load AI apply profile.", success: false });
  }
};

export const updateApplyProfile = async (req, res) => {
  try {
    const updates = pickApplyProfileUpdates(req.body);
    const applyProfile = await AIApplyProfile.findOneAndUpdate(
      { user: req.user.id },
      {
        $set: {
          ...updates,
          onboardingCompleted:
            updates.onboardingCompleted ??
            Boolean(updates.email && updates.phone),
        },
        $setOnInsert: { user: req.user.id },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    return res.status(200).json({
      message: "AI apply profile saved.",
      success: true,
      applyProfile: applyProfile.toSafeObject(),
    });
  } catch (error) {
    console.error("updateApplyProfile error:", error);
    return res
      .status(500)
      .json({ message: "Failed to save AI apply profile.", success: false });
  }
};

export const updatePreferences = async (req, res) => {
  try {
    const updates = pickPreferenceUpdates(req.body);

    const preference = await JobPreference.findOneAndUpdate(
      { user: req.user.id },
      { $set: updates },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    return res
      .status(200)
      .json({ message: "Job preferences saved.", success: true, preference });
  } catch (error) {
    console.error("updatePreferences error:", error);
    return res
      .status(500)
      .json({ message: "Failed to save job preferences.", success: false });
  }
};

export const discoverJobs = async (req, res) => {
  try {
    const preferenceUpdates = pickPreferenceUpdates(
      req.body?.preferences || req.body,
    );
    const preference = Object.keys(preferenceUpdates).length
      ? await JobPreference.findOneAndUpdate(
          { user: req.user.id },
          { $set: preferenceUpdates },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        )
      : await getOrCreatePreference(req.user.id);
    const incomingJobs =
      Array.isArray(req.body?.jobs) && req.body.jobs.length
        ? req.body.jobs
        : await discoverJobsForPreference(preference);

    const created = [];
    const skippedDuplicates = [];
    let skippedLowScore = 0;

    for (const rawJob of incomingJobs) {
      const duplicateKey = makeDuplicateKey(rawJob);
      const scores = scoreJob(rawJob, preference);

      if (scores.matchScore < preference.minimumMatchScore) {
        skippedLowScore += 1;
        continue;
      }

      try {
        const workflow = buildApplicationWorkflow(rawJob);
        const application = await JobApplication.create({
          ...rawJob,
          user: req.user.id,
          duplicateKey,
          ...scores,
          status: workflow.supportedPlatform
            ? "Application Prepared"
            : "Ready To Apply",
          appliedAt: null,
          resumeVersionName:
            preference.resumeVersions?.find((resume) => resume.isDefault)
              ?.name || "Default Resume",
          optimizedResumeSummary: optimizeResumeSummary(rawJob, preference),
          supportedPlatform: workflow.supportedPlatform,
          applyClassification: workflow.applyClassification,
          applicationSupportLevel: workflow.applicationSupportLevel,
          applicationWorkflow: workflow.applicationWorkflow,
          applicationPackage: buildApplicationPackage(rawJob, preference),
        });
        created.push(application);
      } catch (error) {
        if (error.code === 11000) skippedDuplicates.push(rawJob);
        else throw error;
      }
    }

    return res.status(201).json({
      message: `Discovery finished. ${created.length} real job listing(s) added for review.`,
      success: true,
      created,
      skippedDuplicates: skippedDuplicates.length,
      skippedLowScore,
      scanned: incomingJobs.length,
    });
  } catch (error) {
    console.error("discoverJobs error:", error);
    return res
      .status(500)
      .json({
        message: error.message || "Failed to discover jobs.",
        success: false,
      });
  }
};

const runApplyAutomationTask = async ({
  taskId,
  userId,
  applicationId,
  resumeFilePath,
  applyProfile,
}) => {
  updateTask(taskId, {
    status: "running",
    logs: [{ stage: "task_started", message: "Automation task started." }],
  });

  try {
    const application = await JobApplication.findOne({
      _id: applicationId,
      user: userId,
    });
    if (!application) throw new Error("Application not found.");
    if (!isAtsAutomationSupported(application)) {
      throw new Error(
        "AI Apply is only supported for direct Greenhouse and Lever applications.",
      );
    }

    application.automation = {
      ...(application.automation?.toObject?.() || application.automation || {}),
      status: "running",
      taskId,
      lastRunAt: new Date(),
      logs: [
        {
          stage: "task_started",
          message: "Automation task started.",
          at: new Date(),
        },
      ],
    };
    await application.save();

    const result = await attemptApplicationSubmit({
      userId,
      application,
      resumeFilePath,
      applyProfile,
      keepOpen: process.env.PLAYWRIGHT_DEBUG_KEEP_OPEN === "true",
    });

    application.automation = {
      status: result.status,
      taskId,
      sessionId: result.sessionId,
      lastRunAt: new Date(),
      loginPersisted: result.loginPersisted,
      captchaDetected: result.captchaDetected,
      resumeUploadReady: result.resumeUploadReady,
      approvalGate: false,
      inspectedUrl: result.inspectedUrl,
      detectedFields: result.detectedFields,
      preparedActions: result.preparedActions,
      blockers: result.blockers,
      logs: result.logs || [],
    };

    if (result.submitted) {
      application.status = "Applied";
      application.appliedAt = new Date();
      application.notes = "Applied by AI Job Copilot on a supported ATS flow.";
    }

    await application.save();
    if (result.submitted) {
      await sendApplySuccessEmail({ userId, application });
    }

    updateTask(taskId, {
      status: result.submitted ? "submitted" : result.status,
      success: Boolean(result.submitted),
      applicationId: String(application._id),
      automation: application.automation,
      message: result.submitted
        ? "Application submitted."
        : result.status === "prepared"
          ? "ATS form prepared. Review the browser and click final submit."
          : result.blockers?.join(" ") || "Manual review is required.",
      logs: result.logs || [],
    });
  } catch (error) {
    console.error("runApplyAutomationTask error:", error);
    await JobApplication.findOneAndUpdate(
      { _id: applicationId, user: userId },
      {
        $set: {
          "automation.status": "failed",
          "automation.taskId": taskId,
          "automation.lastRunAt": new Date(),
          "automation.blockers": [error.message || "Automation failed."],
        },
        $push: {
          "automation.logs": {
            at: new Date(),
            stage: "failed",
            message: error.message || "Automation failed.",
          },
        },
      },
    );
    updateTask(taskId, {
      status: "failed",
      success: false,
      applicationId: String(applicationId),
      message: error.message || "Automation failed.",
      logs: [
        {
          stage: "failed",
          message: error.message || "Automation failed.",
          at: new Date(),
        },
      ],
    });
  }
};

export const applyToJob = async (req, res) => {
  try {
    const [application, applyProfile] = await Promise.all([
      JobApplication.findOne({
        _id: req.params.applicationId,
        user: req.user.id,
      }),
      getOrCreateApplyProfile(req.user.id),
    ]);

    if (!application) {
      return res
        .status(404)
        .json({ message: "Application not found.", success: false });
    }

    if (!isAtsAutomationSupported(application)) {
      application.automation = {
        ...(application.automation?.toObject?.() ||
          application.automation ||
          {}),
        status: "blocked",
        lastRunAt: new Date(),
        blockers: [
          "AI Apply is only available for direct Greenhouse and Lever application forms.",
        ],
        logs: [
          {
            at: new Date(),
            stage: "classification_block",
            message: `${application.platform} is discovery/external apply only.`,
            url: application.jobUrl,
          },
        ],
      };
      await application.save();
      return res.status(409).json({
        message:
          "This listing is External Apply. Open the listing and continue on the employer site.",
        success: false,
        application,
        automation: application.automation,
      });
    }

    const taskId = createTaskId();
    updateTask(taskId, {
      id: taskId,
      status: "queued",
      success: false,
      applicationId: String(application._id),
      createdAt: new Date(),
      logs: [
        { stage: "queued", message: "Automation queued.", at: new Date() },
      ],
    });

    application.automation = {
      ...(application.automation?.toObject?.() || application.automation || {}),
      status: "queued",
      taskId,
      lastRunAt: new Date(),
      blockers: [],
      logs: [
        {
          at: new Date(),
          stage: "queued",
          message: "Automation queued.",
          url: application.jobUrl,
        },
      ],
    };
    await application.save();

    setImmediate(() => {
      runApplyAutomationTask({
        taskId,
        userId: req.user.id,
        applicationId: application._id,
        resumeFilePath: req.body?.resumeFilePath || applyProfile.resumeFilePath,
        applyProfile: applyProfile.toSafeObject(),
      });
    });

    return res.status(202).json({
      message: "AI Apply task started. Status will update shortly.",
      success: true,
      taskId,
      application,
      automation: application.automation,
    });
  } catch (error) {
    console.error("applyToJob error:", error);
    return res
      .status(500)
      .json({
        message: error.message || "Failed to apply to job.",
        success: false,
      });
  }
};

// AFTER
export const getAutomationTask = async (req, res) => {
  const { taskId } = req.params;

  // 1. Check in-memory Map first (fast path)
  const task = automationTasks.get(taskId);
  if (task) {
    return res.status(200).json({ success: true, task });
  }

  // 2. Fall back to DB — find application with this taskId
  try {
    const application = await JobApplication.findOne({
      user: req.user.id,
      "automation.taskId": taskId,
    }).lean();

    if (!application) {
      return res.status(404).json({ message: "Automation task not found.", success: false });
    }

    // Reconstruct a task-shaped object from the saved automation field
    const automation = application.automation || {};
    const reconstructed = {
      id: taskId,
      status: automation.status || "unknown",
      success: automation.status === "submitted",
      applicationId: String(application._id),
      message:
        automation.blockers?.length
          ? automation.blockers.join(" ")
          : automation.status === "prepared"
          ? "ATS form prepared. Review the browser and click final submit."
          : automation.status === "submitted"
          ? "Application submitted."
          : "Check the browser window.",
      logs: automation.logs || [],
      updatedAt: automation.lastRunAt || new Date(),
    };

    // Re-hydrate the in-memory map so future polls are fast
    automationTasks.set(taskId, reconstructed);

    return res.status(200).json({ success: true, task: reconstructed });
  } catch (error) {
    console.error("getAutomationTask DB fallback error:", error);
    return res.status(500).json({ message: "Failed to retrieve automation task.", success: false });
  }
};

export const applyToAllJobs = async (req, res) => {
  try {
    const requestedIds = Array.isArray(req.body?.applicationIds)
      ? req.body.applicationIds
      : [];
    const applications = await JobApplication.find({
      user: req.user.id,
      status: { $ne: "Applied" },
      jobUrl: { $ne: "" },
      ...(requestedIds.length && { _id: { $in: requestedIds } }),
    }).sort({ priorityScore: -1, createdAt: -1 });

    const applyProfile = await getOrCreateApplyProfile(req.user.id);
    const safeApplyProfile = applyProfile.toSafeObject();
    const results = [];

    for (const application of applications) {
      try {
        if (!isAtsAutomationSupported(application)) {
          results.push({
            id: application._id,
            title: application.title,
            company: application.company,
            queued: false,
            reason:
              "External Apply only. AI Apply supports Greenhouse and Lever.",
          });
          continue;
        }

        const taskId = createTaskId();
        updateTask(taskId, {
          id: taskId,
          status: "queued",
          success: false,
          applicationId: String(application._id),
          createdAt: new Date(),
          logs: [
            { stage: "queued", message: "Automation queued.", at: new Date() },
          ],
        });

        application.automation = {
          ...(application.automation?.toObject?.() ||
            application.automation ||
            {}),
          status: "queued",
          taskId,
          lastRunAt: new Date(),
          blockers: [],
          logs: [
            {
              at: new Date(),
              stage: "queued",
              message: "Automation queued.",
              url: application.jobUrl,
            },
          ],
        };
        await application.save();

        setImmediate(() => {
          runApplyAutomationTask({
            taskId,
            userId: req.user.id,
            applicationId: application._id,
            resumeFilePath:
              req.body?.resumeFilePath || safeApplyProfile.resumeFilePath,
            applyProfile: safeApplyProfile,
          });
        });

        results.push({
          id: application._id,
          title: application.title,
          company: application.company,
          queued: true,
          taskId,
          reason: "",
        });
      } catch (error) {
        results.push({
          id: application._id,
          title: application.title,
          company: application.company,
          queued: false,
          reason: error.message || "Automatic apply failed.",
        });
      }
    }

    const queuedCount = results.filter((result) => result.queued).length;
    return res.status(200).json({
      message: `Apply all queued ${queuedCount}/${results.length} supported ATS application(s).`,
      success: true,
      queuedCount,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error("applyToAllJobs error:", error);
    return res
      .status(500)
      .json({
        message: error.message || "Failed to apply to all jobs.",
        success: false,
      });
  }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const application = await JobApplication.findOneAndUpdate(
      { _id: req.params.applicationId, user: req.user.id },
      { ...(status && { status }), ...(notes !== undefined && { notes }) },
      { new: true, runValidators: true },
    );

    if (!application) {
      return res
        .status(404)
        .json({ message: "Application not found.", success: false });
    }

    return res
      .status(200)
      .json({ message: "Application updated.", success: true, application });
  } catch (error) {
    console.error("updateApplicationStatus error:", error);
    return res
      .status(500)
      .json({ message: "Failed to update application.", success: false });
  }
};

export const startAutomationSession = async (req, res) => {
  try {
    const [application, applyProfile] = await Promise.all([
      JobApplication.findOne({
        _id: req.params.applicationId,
        user: req.user.id,
      }),
      getOrCreateApplyProfile(req.user.id),
    ]);

    if (!application) {
      return res
        .status(404)
        .json({ message: "Application not found.", success: false });
    }

    if (!isAtsAutomationSupported(application)) {
      return res.status(409).json({
        message:
          "Controlled automation is only available for direct Greenhouse and Lever forms.",
        success: false,
      });
    }

    const result = await startApplicationAutomation({
      userId: req.user.id,
      application,
      resumeFilePath: req.body?.resumeFilePath || applyProfile.resumeFilePath,
      applyProfile: applyProfile.toSafeObject(),
    });

    application.automation = {
      status: result.status,
      sessionId: result.sessionId,
      lastRunAt: new Date(),
      loginPersisted: result.loginPersisted,
      captchaDetected: result.captchaDetected,
      resumeUploadReady: result.resumeUploadReady,
      approvalGate: result.approvalGate,
      inspectedUrl: result.inspectedUrl,
      detectedFields: result.detectedFields,
      preparedActions: result.preparedActions,
      blockers: result.blockers,
    };
    application.status =
      result.status === "prepared"
        ? "Application Prepared"
        : application.status;
    await application.save();

    return res.status(200).json({
      message:
        "Controlled browser session started. Review the opened page and submit manually when ready.",
      success: true,
      automation: application.automation,
      application,
    });
  } catch (error) {
    console.error("startAutomationSession error:", error);
    return res
      .status(500)
      .json({
        message: error.message || "Failed to start browser automation.",
        success: false,
      });
  }
};

export const closeAutomationSession = async (req, res) => {
  try {
    const application = await JobApplication.findOne({
      _id: req.params.applicationId,
      user: req.user.id,
    });

    if (!application) {
      return res
        .status(404)
        .json({ message: "Application not found.", success: false });
    }

    const sessionId = application.automation?.sessionId;
    const result = sessionId
      ? await closeApplicationAutomation({ sessionId })
      : { closed: false };

    application.automation = {
      ...(application.automation?.toObject?.() || application.automation || {}),
      status: "closed",
      blockers: application.automation?.blockers || [],
    };
    await application.save();

    return res.status(200).json({
      message: result.closed
        ? "Browser automation session closed."
        : "No active browser session was found.",
      success: true,
      automation: application.automation,
    });
  } catch (error) {
    console.error("closeAutomationSession error:", error);
    return res
      .status(500)
      .json({ message: "Failed to close browser automation.", success: false });
  }
};

export const getDailyReport = async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const applications = await JobApplication.find({
      user: req.user.id,
      $or: [{ appliedAt: { $gte: since } }, { createdAt: { $gte: since } }],
    })
      .sort({ appliedAt: -1, createdAt: -1 })
      .lean();

    return res
      .status(200)
      .json({ report: buildDailyReport(applications), applications });
  } catch (error) {
    console.error("getDailyReport error:", error);
    return res
      .status(500)
      .json({ message: "Failed to build daily report.", success: false });
  }
};

export const sendDailyReport = async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [user, applications] = await Promise.all([
      User.findById(req.user.id).lean(),
      JobApplication.find({
        user: req.user.id,
        $or: [{ appliedAt: { $gte: since } }, { createdAt: { $gte: since } }],
      })
        .sort({ appliedAt: -1, createdAt: -1 })
        .lean(),
    ]);

    const report = buildDailyReport(applications);
    const delivery = await sendDailyReportEmail({ to: user?.email, report });

    return res.status(200).json({
      message: "Daily job report emailed.",
      success: true,
      delivery,
      report,
    });
  } catch (error) {
    console.error("sendDailyReport error:", error);
    return res.status(500).json({
      message: error.message || "Failed to send daily report.",
      success: false,
    });
  }
};
