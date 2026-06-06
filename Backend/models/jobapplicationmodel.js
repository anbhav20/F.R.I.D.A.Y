import mongoose from "mongoose";

const JobApplicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    company: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    platform: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: "" },
    salary: { type: String, trim: true, default: "" },
    workMode: { type: String, trim: true, default: "any" },
    engagementType: { type: String, trim: true, default: "any" },
    jobUrl: { type: String, trim: true, default: "" },
    description: { type: String, default: "" },
    postedAt: { type: Date, default: null },
    appliedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: [
        "Discovered",
        "Application Prepared",
        "Ready To Apply",
        "Applied",
        "Under Review",
        "Shortlisted",
        "Interview Scheduled",
        "Rejected",
        "No Response",
      ],
      default: "Discovered",
      index: true,
    },
    matchScore: { type: Number, default: 0, min: 0, max: 100 },
    atsScore: { type: Number, default: 0, min: 0, max: 100 },
    priorityScore: { type: Number, default: 0, min: 0, max: 100 },
    duplicateKey: { type: String, required: true },
    resumeVersionName: { type: String, trim: true, default: "" },
    optimizedResumeSummary: { type: String, default: "" },
    supportedPlatform: { type: Boolean, default: false, index: true },
    applyClassification: {
      type: String,
      enum: ["AI Apply Ready", "Guided Apply", "External Apply"],
      default: "External Apply",
      index: true,
    },
    applicationSupportLevel: {
      type: String,
      enum: ["unsupported", "guided", "assisted", "structured"],
      default: "guided",
    },
    applicationWorkflow: {
      platform: { type: String, trim: true, default: "" },
      canOpenApplicationPage: { type: Boolean, default: false },
      canAutofillForms: { type: Boolean, default: false },
      canUploadResume: { type: Boolean, default: false },
      canAnswerScreeningQuestions: { type: Boolean, default: false },
      finalSubmitRequiresUser: { type: Boolean, default: true },
      detectedSteps: [{ type: String, trim: true }],
      requiredUserActions: [{ type: String, trim: true }],
    },
    applicationPackage: {
      resumeStrategy: { type: String, default: "" },
      coverNote: { type: String, default: "" },
      screeningAnswerHints: [{ type: String, trim: true }],
    },
    automation: {
      status: {
        type: String,
        enum: ["not_started", "queued", "running", "session_ready", "needs_login", "captcha_required", "prepared", "blocked", "submitted", "failed", "closed"],
        default: "not_started",
      },
      taskId: { type: String, trim: true, default: "" },
      sessionId: { type: String, trim: true, default: "" },
      lastRunAt: { type: Date, default: null },
      loginPersisted: { type: Boolean, default: false },
      captchaDetected: { type: Boolean, default: false },
      resumeUploadReady: { type: Boolean, default: false },
      approvalGate: { type: Boolean, default: true },
      inspectedUrl: { type: String, trim: true, default: "" },
      detectedFields: [
        {
          label: { type: String, trim: true, default: "" },
          name: { type: String, trim: true, default: "" },
          type: { type: String, trim: true, default: "" },
          required: { type: Boolean, default: false },
        },
      ],
      preparedActions: [{ type: String, trim: true }],
      blockers: [{ type: String, trim: true }],
      logs: [
        {
          at: { type: Date, default: Date.now },
          stage: { type: String, trim: true, default: "" },
          message: { type: String, trim: true, default: "" },
          url: { type: String, trim: true, default: "" },
        },
      ],
    },
    notes: { type: String, default: "" },
    signals: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

JobApplicationSchema.index({ user: 1, duplicateKey: 1 }, { unique: true });

export default mongoose.model("JobApplication", JobApplicationSchema);
