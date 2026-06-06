import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  ChevronDown,
  CheckCircle2,
  ExternalLink,
  Mail,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import emailjs from "@emailjs/browser";
import {
  applyToJob,
  applyToAllJobs,
  discoverJobs,
  fetchAutomationTask,
  fetchDailyReport,
  fetchJobDashboard,
  saveApplyProfile,
  saveJobPreferences,
  sendDailyReport,
} from "../service/jobAgent.api";

const EMAILJS_SERVICE_ID = "service_o4djte4";
const EMAILJS_TEMPLATE_ID = "template_hs99fgq";
const EMAILJS_PUBLIC_KEY = "NOjvWxUdOigS4ijvh";

const matchesRole = (app, roles = []) => {
  if (!roles.length) return true;
  const text = [
    app.title,
    app.company,
    app.description,
    app.optimizedResumeSummary,
  ]
    .join(" ")
    .toLowerCase();
  return roles.some((role) => {
    const words = role
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2);
    return words.length > 0 && words.every((word) => text.includes(word));
  });
};

// ─── ATS-first defaults ───────────────────────────────────────────────────────
const emptyPreference = {
  preferredRoles: [],
  skills: [],
  experienceLevel: "any",
  salaryExpectation: "",
  preferredLocations: [],
  workMode: "any",
  engagementType: "any",
  industries: [],
  companyTypes: [],
  workTiming: "",
  preferredPlatforms: ["Greenhouse", "Lever"], // ← ATS-first, not job boards
  atsCompanySlugs: [],
  savedCompanies: [],
  blacklistedCompanies: [],
  emailReportsEnabled: true,
  minimumMatchScore: 70,
};

const emptyApplyProfile = {
  fullName: "",
  email: "",
  phone: "",
  github: "",
  linkedin: "",
  portfolio: "",
  resumeFilePath: "",
  experienceSummary: "",
  currentLocation: "",
  workAuthorization: "",
  consentToAutofill: false,
  onboardingCompleted: false,
};

function Stat({ label, value, icon: Icon }) {
  return (
    <div className="border border-white/10 bg-white/[0.04] rounded-lg p-4 min-h-24">
      <div className="flex items-center justify-between text-zinc-400">
        <span className="text-xs">{label}</span>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-semibold text-white mt-2">{value}</p>
    </div>
  );
}

function ChipInput({ label, values = [], placeholder, onChange }) {
  const [draft, setDraft] = useState("");

  const addDraft = () => {
    const next = draft.trim();
    if (!next) return;
    onChange([...values, next]);
    setDraft("");
  };

  return (
    <label className="block text-xs text-zinc-400">
      {label}
      <div className="mt-1 rounded-lg bg-black/30 border border-white/10 px-2 py-2 focus-within:border-white/30">
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange(values.filter((item) => item !== value))}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs text-white"
            >
              {value}
              <X size={11} />
            </button>
          ))}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={addDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addDraft();
              }
            }}
            className="min-w-28 flex-1 bg-transparent px-1 py-1 text-sm text-white outline-none placeholder:text-zinc-600"
            placeholder={values.length ? "" : placeholder}
          />
        </div>
      </div>
    </label>
  );
}

function AutomationStatus({ automation, status }) {
  const current = automation?.status || status;
  if (!current) return null;

  const statusMap = {
    needs_login: {
      label: "Login Required",
      color: "text-amber-300 bg-amber-400/10 border-amber-400/20",
    },
    Applied: {
      label: "Applied",
      color: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
    },
    "Application Prepared": {
      label: "AI Prepared",
      color: "text-sky-300 bg-sky-400/10 border-sky-400/20",
    },
    "Ready To Apply": {
      label: "Ready",
      color: "text-amber-300 bg-amber-400/10 border-amber-400/20",
    },
    queued: {
      label: "Queued",
      color: "text-violet-300 bg-violet-400/10 border-violet-400/20",
    },
    running: {
      label: "Preparing",
      color: "text-violet-300 bg-violet-400/10 border-violet-400/20",
    },
    captcha_required: {
      label: "Blocked",
      color: "text-red-300 bg-red-400/10 border-red-400/20",
    },
    submitted: {
      label: "Auto-Applied ✓",
      color: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
    },
    blocked: {
      label: "Blocked",
      color: "text-zinc-300 bg-white/5 border-white/10",
    },
    prepared: {
      label: "AI Prepared",
      color: "text-sky-300 bg-sky-400/10 border-sky-400/20",
    },
  };

  const config = statusMap[current] || {
    label: current,
    color: "text-zinc-300 bg-white/5 border-white/10",
  };

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border ${config.color}`}
    >
      {config.label}
    </span>
  );
}

function MatchBadge({ score = 0 }) {
  const label =
    score >= 80 ? "Strong Match" : score >= 60 ? "Good Match" : "Review Match";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-300 px-2 py-1 text-xs">
      <Sparkles size={12} />
      {label}
    </span>
  );
}

function ApplyProfileModal({
  open,
  step,
  setStep,
  applyProfile,
  setApplyProfile,
  preference,
  updateArrayField,
  busy,
  onClose,
  onSave,
}) {
  if (!open) return null;

  const steps = ["Basic info", "Links", "Resume"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-white/10 bg-[#151617] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-base font-semibold">
              Complete Your AI Apply Profile
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Stored encrypted, set up once, editable anytime.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          {steps.map((label, index) => (
            <button
              key={label}
              onClick={() => setStep(index)}
              className={`flex-1 rounded-lg border px-2 py-2 text-xs ${
                step === index
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.03] text-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {step === 0 && (
            <div className="grid sm:grid-cols-3 gap-2">
              {[
                ["fullName", "Full name"],
                ["email", "Email"],
                ["phone", "Phone"],
              ].map(([key, label]) => (
                <label key={key} className="block text-xs text-zinc-400">
                  {label}
                  <input
                    value={applyProfile[key] || ""}
                    onChange={(e) =>
                      setApplyProfile({
                        ...applyProfile,
                        [key]: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                  />
                </label>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                ["linkedin", "LinkedIn"],
                ["github", "GitHub"],
                ["portfolio", "Portfolio"],
                ["currentLocation", "Location"],
              ].map(([key, label]) => (
                <label key={key} className="block text-xs text-zinc-400">
                  {label}
                  <input
                    value={applyProfile[key] || ""}
                    onChange={(e) =>
                      setApplyProfile({
                        ...applyProfile,
                        [key]: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                  />
                </label>
              ))}
            </div>
          )}

          {step === 2 && (
            <>
              <label className="block text-xs text-zinc-400">
                Resume file path
                <input
                  value={applyProfile.resumeFilePath || ""}
                  onChange={(e) =>
                    setApplyProfile({
                      ...applyProfile,
                      resumeFilePath: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                />
              </label>
              <ChipInput
                label="Preferred roles"
                values={preference.preferredRoles || []}
                placeholder="React Developer"
                onChange={(values) =>
                  updateArrayField("preferredRoles", values)
                }
              />
              <label className="block text-xs text-zinc-400">
                Experience summary
                <textarea
                  value={applyProfile.experienceSummary || ""}
                  onChange={(e) =>
                    setApplyProfile({
                      ...applyProfile,
                      experienceSummary: e.target.value,
                    })
                  }
                  className="mt-1 w-full min-h-24 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={Boolean(applyProfile.consentToAutofill)}
                  onChange={(e) =>
                    setApplyProfile({
                      ...applyProfile,
                      consentToAutofill: e.target.checked,
                    })
                  }
                />
                Allow assisted autofill from this profile
              </label>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-40"
          >
            Back
          </button>
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={onSave}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-medium text-black disabled:opacity-50"
            >
              <Save size={14} />
              Save profile
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export default function JobAgent() {
  const [preference, setPreference] = useState(emptyPreference);
  const [applyProfile, setApplyProfile] = useState(emptyApplyProfile);
  const [showProfile, setShowProfile] = useState(false);
  const [profileStep, setProfileStep] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    applied: 0,
    prepared: 0,
    supported: 0,
    interviews: 0,
    byStatus: {},
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [applyingId, setApplyingId] = useState("");
  const [report, setReport] = useState("");
  const [notice, setNotice] = useState("");
  const [browserOpenIds, setBrowserOpenIds] = useState(new Set());

  const visibleApplications = applications.filter((app) =>
    matchesRole(app, preference.preferredRoles || []),
  );

  const loadDashboard = async () => {
    const { data } = await fetchJobDashboard();
    setPreference({ ...emptyPreference, ...data.preference });
    setApplyProfile({ ...emptyApplyProfile, ...data.applyProfile });
    setShowProfile(!data.applyProfile?.onboardingCompleted);
    setApplications(data.applications || []);
    setStats(
      data.stats || {
        total: 0,
        applied: 0,
        prepared: 0,
        supported: 0,
        interviews: 0,
        byStatus: {},
      },
    );
  };

  useEffect(() => {
    fetchJobDashboard()
      .then(({ data }) => {
        setPreference({ ...emptyPreference, ...data.preference });
        setApplyProfile({ ...emptyApplyProfile, ...data.applyProfile });
        setShowProfile(!data.applyProfile?.onboardingCompleted);
        setApplications(data.applications || []);
        setStats(
          data.stats || {
            total: 0,
            applied: 0,
            prepared: 0,
            supported: 0,
            interviews: 0,
            byStatus: {},
          },
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const updateArrayField = (key, values) => {
    setPreference((current) => ({ ...current, [key]: values }));
  };

  const save = async () => {
    setBusy(true);
    setNotice("");
    try {
      const { data } = await saveJobPreferences(preference);
      setPreference({ ...emptyPreference, ...data.preference });
      setNotice("Preferences saved.");
    } catch (error) {
      setNotice(
        error?.response?.data?.message || "Failed to save preferences.",
      );
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    setNotice("");
    try {
      const payload = { ...applyProfile, onboardingCompleted: true };
      const [{ data }] = await Promise.all([
        saveApplyProfile(payload),
        saveJobPreferences(preference),
      ]);
      setApplyProfile({ ...emptyApplyProfile, ...data.applyProfile });
      setShowProfile(false);
      setNotice("AI Apply Profile saved.");
    } catch (error) {
      setNotice(
        error?.response?.data?.message || "Failed to save AI Apply Profile.",
      );
    } finally {
      setBusy(false);
    }
  };

  const runDiscovery = async () => {
    setBusy(true);
    setNotice("");
    try {
      if (!preference.preferredRoles?.length) {
        setNotice("Add a target role first — e.g. Full Stack Developer.");
        return;
      }
      if (
        !preference.atsCompanySlugs?.length &&
        !preference.preferredRoles?.length
      ) {
        setNotice(
          "Add ATS company slugs (e.g. stripe, notion) or target roles to scan direct ATS job boards.",
        );
        return;
      }
      const { data } = await discoverJobs(preference);
      setNotice(data.message || "Discovery finished.");
      await loadDashboard();
    } catch (error) {
      setNotice(
        error?.response?.data?.message ||
          "Discovery failed. Add company slugs or check your search API config.",
      );
    } finally {
      setBusy(false);
    }
  };

  const pollAutomationTask = async (taskId) => {
    const terminalStatuses = new Set([
      "prepared",
      "submitted",
      "blocked",
      "failed",
      "captcha_required",
      "needs_login",
    ]);

    for (let attempt = 0; attempt < 24; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const { data } = await fetchAutomationTask(taskId);
        const task = data?.task;
        if (!task) continue;

        if (task.status === "running") setNotice("AI is filling the ATS form...");
        else if (task.status === "queued") setNotice("Waiting for automation to start...");

        if (terminalStatuses.has(task.status)) {
          setNotice(task.message || "Automation status updated.");
          await loadDashboard();
          return task;
        }
      } catch (error) {
        const status = error?.response?.status;
        if (status === 404) {
          if (attempt < 5) continue;
          setNotice("Automation task not found. The server may have restarted.");
          await loadDashboard();
          return null;
        }
        if (status >= 500) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue;
        }
        setNotice("Lost connection while tracking automation. Check the dashboard.");
        await loadDashboard();
        return null;
      }
    }

    setNotice("AI Apply is taking longer than expected. Check the dashboard.");
    await loadDashboard();
    return null;
  };

  const applyOne = async (id) => {
    setApplyingId(id);
    setNotice("");
    try {
      const { data } = await applyToJob(id);
      if (data.taskId) {
        setNotice("AI Apply task started. Preparing the ATS form...");
        await loadDashboard();
        await pollAutomationTask(data.taskId);
        return;
      }
      if (data.automation?.browserOpen || data.browserOpen) {
        setBrowserOpenIds((prev) => new Set([...prev, id]));
        setNotice(
          data.message ||
            "Browser window open — login there, then click Retry Apply.",
        );
      } else {
        setBrowserOpenIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setNotice(data.message || "Application submitted.");
      }
      await loadDashboard();
    } catch (error) {
      setNotice(
        error?.response?.data?.message ||
          "Could not auto-apply. Open the application manually.",
      );
    } finally {
      setApplyingId("");
    }
  };

  const applyAll = async () => {
    setBusy(true);
    setNotice("");
    try {
      const { data } = await applyToAllJobs(
        visibleApplications.map((app) => app._id),
      );
      const failed =
        data.results?.filter((r) => !r.queued).slice(0, 3) || [];
      const reason = failed.length
        ? ` Reasons: ${failed.map((i) => `${i.title}: ${i.reason}`).join(" ")}`
        : "";
      setNotice(`${data.message || "Apply all finished."}${reason}`);
      await loadDashboard();
    } catch (error) {
      setNotice(error?.response?.data?.message || "Apply all failed.");
    } finally {
      setBusy(false);
    }
  };

  const loadReport = async () => {
    const { data } = await fetchDailyReport();
    setReport(data.report?.body || "");
  };

  const emailReport = async () => {
    setBusy(true);
    setNotice("");
    try {
      const { data } = await sendDailyReport();
      setReport(data.report?.body || "");
      setNotice(data.message || "Daily report emailed.");
    } catch (error) {
      const msg = error?.response?.data?.message || "";
      if (msg === "BACKEND_EMAIL_UNAVAILABLE" || error?.response?.status === 500) {
        try {
          setNotice("Server email unavailable, trying EmailJS...");
          const { data: reportData } = await fetchDailyReport();
          const reportBody = reportData.report?.body || "No report data available.";
          setReport(reportBody);
          await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            { name: "AI Job Agent || F.R.I.D.A.Y", email: "noreply@jobagent.ai", message: reportBody },
            EMAILJS_PUBLIC_KEY,
          );
          setNotice("Daily report emailed via EmailJS ✓");
        } catch (ejsError) {
          console.error("EmailJS fallback failed:", ejsError);
          setNotice("Both email methods failed. Check your email config.");
        }
      } else {
        setNotice(msg || "Failed to email report.");
      }
    } finally {
      setBusy(false);
    }
  };

  const getApplyButtonLabel = (app) => {
    if (applyingId === app._id) return "Preparing...";
    if (browserOpenIds.has(app._id)) return "Retry Apply";
    return "AI Apply";
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#101113] text-white">
      <ApplyProfileModal
        open={showProfile}
        step={profileStep}
        setStep={setProfileStep}
        applyProfile={applyProfile}
        setApplyProfile={setApplyProfile}
        preference={preference}
        updateArrayField={updateArrayField}
        busy={busy}
        onClose={() => setShowProfile(false)}
        onSave={saveProfile}
      />

      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#101113]/95 backdrop-blur px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/chat"
              className="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
              title="Back to chat"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate">
                AI Job Copilot
              </h1>
              <p className="text-xs text-zinc-500 truncate">
                Direct ATS discovery · Greenhouse & Lever
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setProfileStep(0); setShowProfile(true); }}
              disabled={busy}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white text-xs font-medium disabled:opacity-50"
            >
              <UserRound size={14} />
              Apply profile
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-black text-xs font-medium disabled:opacity-50"
            >
              <Save size={14} />
              Save
            </button>
            <button
              onClick={runDiscovery}
              disabled={busy}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 text-black text-xs font-medium disabled:opacity-50"
            >
              <Play size={14} />
              Scan ATS jobs
            </button>
            <button
              onClick={applyAll}
              disabled={busy || visibleApplications.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-400 text-black text-xs font-medium disabled:opacity-50"
            >
              <Zap size={14} />
              Apply all
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Applications Sent" value={stats.applied} icon={CheckCircle2} />
          <Stat label="AI Prepared" value={stats.prepared} icon={Sparkles} />
          <Stat label="Interviews" value={stats.interviews} icon={BriefcaseBusiness} />
          <Stat
            label="Response Rate"
            value={
              stats.applied
                ? `${Math.round((stats.interviews / stats.applied) * 100)}%`
                : "0%"
            }
            icon={ShieldCheck}
          />
        </section>

        {notice && (
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
            {notice}
          </div>
        )}

        <section className="grid lg:grid-cols-[320px_1fr] gap-4">
          {/* ── Preferences Panel ── */}
          <div className="border border-white/10 rounded-lg bg-white/[0.03] p-4 h-fit">
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 text-sm font-semibold lg:pointer-events-none"
            >
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal size={16} />
                Filters
              </span>
              <ChevronDown
                size={16}
                className={`transition lg:hidden ${filtersOpen ? "rotate-180" : ""}`}
              />
            </button>

            <div className={`${filtersOpen ? "block" : "hidden"} lg:block mt-3 space-y-3`}>
              <ChipInput
                label="Roles"
                values={preference.preferredRoles || []}
                placeholder="Full Stack Developer"
                onChange={(values) => updateArrayField("preferredRoles", values)}
              />
              <ChipInput
                label="Skills"
                values={preference.skills || []}
                placeholder="React"
                onChange={(values) => updateArrayField("skills", values)}
              />
              <ChipInput
                label="Locations"
                values={preference.preferredLocations || []}
                placeholder="Remote"
                onChange={(values) => updateArrayField("preferredLocations", values)}
              />

              {/* ATS company slugs — primary discovery input */}
              <ChipInput
                label="ATS companies (primary)"
                values={preference.atsCompanySlugs || []}
                placeholder="stripe, notion, linear"
                onChange={(values) => updateArrayField("atsCompanySlugs", values)}
              />

              {/* Info box under the slug input */}
              <div className="rounded-lg border border-sky-400/20 bg-sky-400/5 px-3 py-2 text-xs text-sky-100 space-y-1">
                <p className="font-medium">How discovery works</p>
                <p>Add company slugs above — e.g. <span className="font-mono text-sky-300">stripe</span>, <span className="font-mono text-sky-300">notion</span>.</p>
                <p>Jobs are fetched directly from Greenhouse &amp; Lever APIs. No job-board redirects.</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-zinc-400">
                  Mode
                  <select
                    value={preference.workMode}
                    onChange={(e) =>
                      setPreference({ ...preference, workMode: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="any">Any</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">Onsite</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  Type
                  <select
                    value={preference.engagementType}
                    onChange={(e) =>
                      setPreference({ ...preference, engagementType: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none"
                  >
                    <option value="any">Any</option>
                    <option value="internship">Internship</option>
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="contract">Contract</option>
                  </select>
                </label>
              </div>

              <label className="block text-xs text-zinc-400">
                Salary expectation
                <input
                  value={preference.salaryExpectation}
                  onChange={(e) =>
                    setPreference({ ...preference, salaryExpectation: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                  placeholder="6 LPA, 25k/month"
                />
              </label>

              <label className="block text-xs text-zinc-400">
                Minimum match score: {preference.minimumMatchScore}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={preference.minimumMatchScore}
                  onChange={(e) =>
                    setPreference({
                      ...preference,
                      minimumMatchScore: Number(e.target.value),
                    })
                  }
                  className="mt-2 w-full"
                />
              </label>

              <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-100 space-y-1">
                <p className="font-medium">How AI Apply works</p>
                <p>1. Click Apply — browser opens the ATS form directly</p>
                <p>2. If login is needed, login in that window</p>
                <p>3. Click Retry Apply — session saved, apply continues</p>
              </div>
            </div>
          </div>

          {/* ── Jobs Panel ── */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Job feed</h2>
                <p className="text-xs text-zinc-500">
                  {visibleApplications.length} direct ATS opportunities
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={loadReport}
                  className="inline-flex items-center gap-2 text-xs text-zinc-300 hover:text-white"
                >
                  <Mail size={14} />
                  Preview report
                </button>
                <button
                  onClick={emailReport}
                  disabled={busy}
                  className="inline-flex items-center gap-2 text-xs text-zinc-300 hover:text-white disabled:opacity-50"
                >
                  <Mail size={14} />
                  Email report
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-zinc-500 py-12 text-center">
                Loading job agent...
              </div>
            ) : visibleApplications.length === 0 ? (
              <div className="border border-white/10 rounded-lg py-12 text-center space-y-2">
                <p className="text-sm text-zinc-500">No direct ATS jobs found yet.</p>
                <p className="text-xs text-zinc-600">
                  Add company slugs in Filters, then click "Scan ATS jobs".
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {visibleApplications.map((app) => {
                  const isBrowserOpen = browserOpenIds.has(app._id);
                  const automationStatus = app.automation?.status;
                  const blockers = app.automation?.blockers || [];

                  return (
                    <article
                      key={app._id}
                      className="border border-white/10 bg-white/[0.04] rounded-lg p-4 hover:border-white/20 transition"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm text-white truncate">
                              {app.title}
                            </h3>
                            <AutomationStatus
                              automation={app.automation}
                              status={app.status}
                            />
                            {app.supportedPlatform && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 text-sky-300 px-2 py-0.5 text-xs border border-sky-400/20">
                                <Zap size={11} />
                                AI Apply Ready
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 mt-1">
                            {app.company} — {app.platform} —{" "}
                            {app.location || "Location not listed"}
                          </p>
                          <p className="text-xs text-zinc-500 mt-2 line-clamp-2">
                            {app.optimizedResumeSummary}
                          </p>

                          {isBrowserOpen &&
                            (automationStatus === "needs_login" ||
                              automationStatus === "captcha_required") && (
                              <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200 space-y-0.5">
                                <p className="font-medium">
                                  {automationStatus === "needs_login"
                                    ? "🔐 Browser window open"
                                    : "🤖 CAPTCHA detected"}
                                </p>
                                <p>
                                  {automationStatus === "needs_login"
                                    ? "Login in that window, then click Retry Apply below."
                                    : "Solve the CAPTCHA in that window, then click Retry Apply."}
                                </p>
                              </div>
                            )}

                          {!isBrowserOpen && blockers.length > 0 && (
                            <p className="mt-2 text-xs text-amber-200 line-clamp-2">
                              {blockers.join(" ")}
                            </p>
                          )}
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                          <MatchBadge score={app.matchScore} />
                          <span
                            className="text-xs rounded-full bg-white/5 text-zinc-300 px-2 py-1"
                            title="Resume compatibility score"
                          >
                            Resume fit {app.atsScore}%
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {app.status !== "Applied" && app.supportedPlatform && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              applyOne(app._id);
                            }}
                            disabled={Boolean(applyingId)}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
                              isBrowserOpen
                                ? "bg-amber-400 text-black"
                                : "bg-emerald-500 text-black"
                            }`}
                          >
                            {isBrowserOpen ? (
                              <RefreshCw size={13} />
                            ) : (
                              <Zap size={13} />
                            )}
                            {getApplyButtonLabel(app)}
                          </button>
                        )}

                        {app.status !== "Applied" && !app.supportedPlatform && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-400">
                            External Apply
                          </span>
                        )}

                        {app.jobUrl && (
                          <a
                            href={app.jobUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white"
                          >
                            <ExternalLink size={13} />
                            Open ATS form
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {report && (
              <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-zinc-300">
                {report}
              </pre>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}