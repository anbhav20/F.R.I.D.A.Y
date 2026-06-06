// ============================================================
// jobAgent.js — ATS-First Job Discovery Architecture
// ============================================================
// Discovery priority:
//   1. Direct Greenhouse API  (boards-api.greenhouse.io)
//   2. Direct Lever API       (api.lever.co)
//   3. Search-assisted ATS    (Tavily/Serper → extract greenhouse.io / lever.co URLs only)
//
// Job-board URLs (LinkedIn, Naukri, Indeed, etc.) are NEVER stored
// as application URLs. Those platforms may surface job titles during
// search, but the stored jobUrl is always a direct ATS form URL.
// ============================================================

// ─── Normalisation helpers ────────────────────────────────────────────────────

const normalize = (value) => String(value || "").trim().toLowerCase();

export const makeDuplicateKey = ({ company, title, platform, jobUrl }) => {
  const stableUrl = normalize(jobUrl).replace(/\/$/, "");
  if (stableUrl) return stableUrl;
  return [company, title, platform].map(normalize).join("|");
};

const splitTerms = (items = []) =>
  items
    .flatMap((item) => String(item).split(","))
    .map((item) => normalize(item))
    .filter(Boolean);

const includesAny = (haystack, needles) =>
  needles.some((needle) => haystack.includes(needle));

const roleMatchesAny = (haystack, roles) =>
  roles.some((role) => {
    if (haystack.includes(role)) return true;
    const words = role.split(/\s+/).filter((word) => word.length > 2);
    return words.length > 0 && words.every((word) => haystack.includes(word));
  });

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true ONLY for direct Greenhouse or Lever application form URLs.
 *
 * Lever:      jobs.lever.co/COMPANY/UUID-v4   (36-char UUID required)
 *             ✅ jobs.lever.co/gohighlevel/bb608431-caec-4e36-9487-0578946fde15
 *             ❌ jobs.lever.co/gohighlevel          (listing page — rejected)
 *
 * Greenhouse: boards.greenhouse.io/COMPANY/jobs/NUMERIC_ID  (numeric ID required)
 *             ✅ boards.greenhouse.io/stripe/jobs/7890123
 *             ❌ boards.greenhouse.io/stripe              (listing page — rejected)
 *             ❌ greenhouse.io/boards/                    (too generic — rejected)
 */
const isDirectAtsUrl = (url = "") => {
  if (!url) return false;

  // Lever: must have a UUID (8-4-4-4-12 hex) as the second path segment
  if (/lever\.co/i.test(url)) {
    return /jobs\.lever\.co\/[^/]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(url);
  }

  // Greenhouse: must have /jobs/ followed by a numeric ID
  if (/greenhouse\.io/i.test(url)) {
    return /greenhouse\.io\/[^/]+\/jobs\/\d+/i.test(url);
  }

  return false;
};

/**
 * Legacy guard kept for isAtsAutomationSupported (used in controller).
 * Only Greenhouse and Lever are automation-supported.
 */
export const isAtsAutomationSupported = (application = {}) =>
  ["Greenhouse", "Lever"].includes(
    application.applicationWorkflow?.platform || application.platform,
  );

// ─── Scoring ──────────────────────────────────────────────────────────────────

export const scoreJob = (job, preference = {}) => {
  const haystack = normalize(
    [
      job.title,
      job.company,
      job.description,
      job.location,
      job.platform,
      job.workMode,
      job.engagementType,
    ].join(" "),
  );

  const roleTerms = splitTerms(preference.preferredRoles);
  const skillTerms = splitTerms(preference.skills);
  const locationTerms = splitTerms(preference.preferredLocations);
  const industryTerms = splitTerms(preference.industries);
  const companyTypeTerms = splitTerms(preference.companyTypes);
  const savedCompanies = splitTerms(preference.savedCompanies);
  const blacklistedCompanies = splitTerms(preference.blacklistedCompanies);

  if (blacklistedCompanies.includes(normalize(job.company))) {
    return {
      matchScore: 0,
      atsScore: 0,
      priorityScore: 0,
      signals: ["Blacklisted company"],
    };
  }

  const signals = [];
  let score = 20;
  const hasRoleFilter = roleTerms.length > 0;
  const roleMatches = hasRoleFilter && roleMatchesAny(haystack, roleTerms);

  if (hasRoleFilter && !roleMatches) {
    return {
      matchScore: 0,
      atsScore: 0,
      priorityScore: 0,
      signals: ["Role mismatch"],
    };
  }

  if (!hasRoleFilter || roleMatches) {
    score += 20;
    signals.push("Role match");
  }

  const matchedSkills = skillTerms.filter((skill) => haystack.includes(skill));
  if (matchedSkills.length) {
    score += Math.min(25, matchedSkills.length * 5);
    signals.push(`${matchedSkills.length} skill matches`);
  }

  if (
    preference.workMode === "any" ||
    !preference.workMode ||
    normalize(job.workMode).includes(preference.workMode)
  ) {
    score += 10;
    signals.push("Work mode fit");
  }

  if (
    preference.engagementType === "any" ||
    !preference.engagementType ||
    normalize(job.engagementType).includes(preference.engagementType)
  ) {
    score += 10;
    signals.push("Job type fit");
  }

  if (
    !locationTerms.length ||
    includesAny(normalize(job.location), locationTerms) ||
    preference.workMode === "remote"
  ) {
    score += 10;
    signals.push("Location fit");
  }

  if (industryTerms.length && includesAny(haystack, industryTerms)) {
    score += 5;
    signals.push("Industry fit");
  }

  if (companyTypeTerms.length && includesAny(haystack, companyTypeTerms)) {
    score += 5;
    signals.push("Company type fit");
  }

  if (savedCompanies.includes(normalize(job.company))) {
    score += 10;
    signals.push("Saved company");
  }

  const postedAt = job.postedAt ? new Date(job.postedAt) : null;
  const ageHours =
    postedAt ? (Date.now() - postedAt.getTime()) / 3600000 : null;
  if (ageHours !== null && ageHours <= 48) {
    score += 5;
    signals.push("Recently posted");
  }

  const matchScore = Math.max(0, Math.min(100, Math.round(score)));
  const atsScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (matchedSkills.length / Math.max(skillTerms.length, 1)) * 100,
      ),
    ),
  );
  const priorityScore = Math.round(matchScore * 0.7 + atsScore * 0.3);

  return { matchScore, atsScore, priorityScore, signals };
};

// ─── Resume / package helpers (unchanged) ─────────────────────────────────────

export const optimizeResumeSummary = (job, preference = {}) => {
  const skills = splitTerms(preference.skills).slice(0, 8).join(", ");
  const roles = splitTerms(preference.preferredRoles).slice(0, 3).join(", ");
  return [
    roles
      ? `Positioning: ${roles}.`
      : "Positioning: role-aligned candidate.",
    skills
      ? `Highlighted skills: ${skills}.`
      : "Highlighted skills: selected from the user's active resume.",
    `Target job: ${job.title} at ${job.company}.`,
  ].join(" ");
};

export const buildApplicationPackage = (job, preference = {}) => {
  const skills = splitTerms(preference.skills).slice(0, 6);
  const role = preference.preferredRoles?.[0] || job.title;
  const defaultResume = preference.resumeVersions?.find(
    (resume) => resume.isDefault,
  );

  return {
    resumeStrategy: [
      `Use ${defaultResume?.name || "the default resume"} as the base resume.`,
      skills.length
        ? `Emphasize ${skills.join(", ")} for this ${role} application.`
        : "Emphasize the strongest role-relevant projects and outcomes.",
      `Align the profile summary to ${job.title} at ${job.company}.`,
    ].join(" "),
    coverNote: [
      `I am interested in the ${job.title} role at ${job.company}.`,
      skills.length
        ? `My background includes hands-on work with ${skills.slice(0, 4).join(", ")}.`
        : "My background is aligned with the role requirements.",
      "I would be glad to discuss how I can contribute to the team.",
    ].join(" "),
    screeningAnswerHints: [
      "Use concise, truthful answers based on the saved profile and resume.",
      preference.salaryExpectation
        ? `For compensation questions, use: ${preference.salaryExpectation}.`
        : "For compensation questions, keep the answer flexible unless the user sets a target.",
      preference.workTiming
        ? `For availability or timing questions, use: ${preference.workTiming}.`
        : "For availability questions, ask the user if the resume/profile does not provide an answer.",
    ],
  };
};

// ─── Application workflow builder (unchanged logic) ───────────────────────────

export const buildApplicationWorkflow = (job = {}) => {
  const platform = inferPlatform(job.jobUrl, job.platform || job.title);

  const supportedWorkflows = {
    Greenhouse: {
      level: "assisted",
      canAutofillForms: true,
      canUploadResume: true,
      canAnswerScreeningQuestions: true,
      detectedSteps: [
        "Open Greenhouse job page",
        "Autofill profile fields",
        "Upload resume",
        "Prepare screening answers",
        "Pause before final submit",
      ],
      requiredUserActions: ["Review application", "Click final Submit"],
    },
    Lever: {
      level: "assisted",
      canAutofillForms: true,
      canUploadResume: true,
      canAnswerScreeningQuestions: true,
      detectedSteps: [
        "Open Lever job page",
        "Autofill profile fields",
        "Upload resume",
        "Prepare screening answers",
        "Pause before final submit",
      ],
      requiredUserActions: ["Review application", "Click final Submit"],
    },
    // Everything else is external-apply only
    External: {
      level: "unsupported",
      canAutofillForms: false,
      canUploadResume: false,
      canAnswerScreeningQuestions: false,
      detectedSteps: [
        "Open external application link manually",
      ],
      requiredUserActions: ["Apply on the employer site"],
    },
  };

  const config =
    supportedWorkflows[platform] || supportedWorkflows["External"];
  const supportedPlatform = ["Greenhouse", "Lever"].includes(platform);

  return {
    platform,
    supportedPlatform,
    applyClassification: supportedPlatform ? "AI Apply Ready" : "External Apply",
    applicationSupportLevel: config.level,
    applicationWorkflow: {
      platform,
      canOpenApplicationPage: Boolean(job.jobUrl),
      canAutofillForms: config.canAutofillForms,
      canUploadResume: config.canUploadResume,
      canAnswerScreeningQuestions: config.canAnswerScreeningQuestions,
      finalSubmitRequiresUser: true,
      detectedSteps: config.detectedSteps,
      requiredUserActions: config.requiredUserActions,
    },
  };
};

// ─── Platform inference ───────────────────────────────────────────────────────

const PLATFORM_HINTS = [
  ["greenhouse.io", "Greenhouse"],
  ["lever.co", "Lever"],
];

const inferPlatform = (url = "", title = "") => {
  const text = normalize(`${url} ${title}`);
  return PLATFORM_HINTS.find(([hint]) => text.includes(hint))?.[1] || "External";
};

// ─── ATS company-slug helpers ─────────────────────────────────────────────────

const parseAtsCompanySlug = (value = "") => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (!trimmed.includes("/")) return trimmed.toLowerCase();
  try {
    const url = new URL(trimmed);
    const hostParts = url.hostname.replace(/^www\./, "").split(".");
    if (hostParts[0] === "boards" && url.pathname) {
      return url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() || "";
    }
    return hostParts[0]?.toLowerCase() || "";
  } catch {
    return trimmed.split("/").filter(Boolean).at(-1)?.toLowerCase() || "";
  }
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `ATS API failed with HTTP ${response.status}: ${url}`,
    );
  return response.json();
};

// ─── Greenhouse discovery ─────────────────────────────────────────────────────

const inferWorkMode = (text = "", preference = {}) => {
  const lower = normalize(text);
  if (lower.includes("remote")) return "remote";
  if (lower.includes("hybrid")) return "hybrid";
  if (lower.includes("onsite") || lower.includes("on-site")) return "onsite";
  return preference.workMode || "any";
};

const inferEngagementType = (text = "", preference = {}) => {
  const lower = normalize(text);
  if (lower.includes("intern")) return "internship";
  if (lower.includes("contract")) return "contract";
  if (lower.includes("part time") || lower.includes("part-time"))
    return "part-time";
  if (lower.includes("full time") || lower.includes("full-time"))
    return "full-time";
  return preference.engagementType || "any";
};

const normalizeGreenhouseJob = (job = {}, companySlug = "", preference = {}) => ({
  company: job.company_name || companySlug,
  title: job.title,
  platform: "Greenhouse",
  location: job.location?.name || "",
  salary: "",
  workMode: inferWorkMode(
    `${job.title} ${job.location?.name}`,
    preference,
  ),
  engagementType: inferEngagementType(
    `${job.title} ${job.content}`,
    preference,
  ),
  // absolute_url is always the direct Greenhouse apply form
  jobUrl: job.absolute_url || "",
  description: String(job.content || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim(),
  postedAt: job.updated_at || null,
  atsSource: "greenhouse-api", // marks origin for debugging
});

const discoverGreenhouseJobs = async (companySlug, preference = {}) => {
  const data = await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`,
  );
  return (data.jobs || [])
    .map((job) => normalizeGreenhouseJob(job, companySlug, preference))
    .filter((job) => job.title && job.jobUrl && isDirectAtsUrl(job.jobUrl));
};

// ─── Lever discovery ──────────────────────────────────────────────────────────

const normalizeLeverJob = (job = {}, companySlug = "", preference = {}) => {
  // hostedUrl from Lever API is always jobs.lever.co/COMPANY/UUID-v4.
  // applyUrl can be a redirect or the listing root — never use it as jobUrl.
  // If hostedUrl is not a valid direct form URL, isDirectAtsUrl filter in
  // discoverLeverJobs will drop this job entirely.
  const jobUrl = isDirectAtsUrl(job.hostedUrl || "") ? (job.hostedUrl || "") : "";

  return {
    company: job.categories?.team || companySlug,
    title: job.text,
    platform: "Lever",
    location: job.categories?.location || "",
    salary: "",
    workMode: inferWorkMode(
      `${job.text} ${job.categories?.location} ${job.workplaceType}`,
      preference,
    ),
    engagementType: inferEngagementType(
      `${job.text} ${job.categories?.commitment}`,
      preference,
    ),
    jobUrl,
    description: [job.descriptionPlain, job.additionalPlain]
      .filter(Boolean)
      .join("\n"),
    postedAt: job.createdAt ? new Date(job.createdAt) : null,
    atsSource: "lever-api",
  };
};

const discoverLeverJobs = async (companySlug, preference = {}) => {
  const data = await fetchJson(
    `https://api.lever.co/v0/postings/${companySlug}?mode=json`,
  );
  return (Array.isArray(data) ? data : [])
    .map((job) => normalizeLeverJob(job, companySlug, preference))
    .filter((job) => job.title && job.jobUrl && isDirectAtsUrl(job.jobUrl));
};

// ─── Slug-based ATS discovery (user-configured companies) ─────────────────────

const discoverDirectAtsJobs = async (preference = {}) => {
  const slugs = splitTerms(preference.atsCompanySlugs)
    .map(parseAtsCompanySlug)
    .filter(Boolean);

  if (!slugs.length) return [];

  // Respect preferredPlatforms but default to both
  const providers =
    preference.preferredPlatforms?.filter((p) =>
      ["Greenhouse", "Lever"].includes(p),
    ) || ["Greenhouse", "Lever"];

  const jobs = [];

  for (const slug of slugs.slice(0, 20)) {
    if (providers.includes("Greenhouse")) {
      try {
        const found = await discoverGreenhouseJobs(slug, preference);
        console.log(
          `[ATSDiscovery] Greenhouse ${slug}: ${found.length} job(s) found.`,
        );
        jobs.push(...found);
      } catch (error) {
        console.warn(
          `[ATSDiscovery] Greenhouse ${slug} failed:`,
          error.message,
        );
      }
    }
    if (providers.includes("Lever")) {
      try {
        const found = await discoverLeverJobs(slug, preference);
        console.log(
          `[ATSDiscovery] Lever ${slug}: ${found.length} job(s) found.`,
        );
        jobs.push(...found);
      } catch (error) {
        console.warn(`[ATSDiscovery] Lever ${slug} failed:`, error.message);
      }
    }
  }

  return jobs;
};

// ─── Search-assisted ATS discovery ───────────────────────────────────────────
//
// When the user hasn't configured company slugs, we use Tavily/Serper to
// surface greenhouse.io and lever.co URLs for their target roles.
// Job-board URLs (LinkedIn, Naukri, Indeed, etc.) are discarded entirely.
//

const buildAtsSearchQueries = (preference = {}) => {
  const roles = preference.preferredRoles?.filter(Boolean).slice(0, 3) || [];
  if (!roles.length) {
    throw new Error(
      "Add at least one target role before scanning jobs.",
    );
  }

  const locations = preference.preferredLocations?.length
    ? preference.preferredLocations.slice(0, 2)
    : [""];

  const type =
    preference.engagementType && preference.engagementType !== "any"
      ? preference.engagementType
      : "job";

  const mode =
    preference.workMode && preference.workMode !== "any"
      ? preference.workMode
      : "";

  // We only ask search engines for direct ATS pages
  const ATS_SITE_FILTER =
    "site:boards.greenhouse.io OR site:jobs.lever.co";

  return roles
    .flatMap((role) =>
      locations.map((location) =>
        [role, type, mode, location, ATS_SITE_FILTER]
          .filter(Boolean)
          .join(" "),
      ),
    )
    .slice(0, 8);
};

const searchWithTavily = async (query) => {
  if (!process.env.TAVILY_API_KEY) return [];
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: 10,
      include_answer: false,
    }),
  });
  if (!response.ok)
    throw new Error(`Tavily search failed with HTTP ${response.status}`);
  const data = await response.json();
  return (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    sourceQuery: query,
  }));
};

const searchWithSerper = async (query) => {
  if (!process.env.SERPER_API_KEY) return [];
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 10 }),
  });
  if (!response.ok)
    throw new Error(`Serper search failed with HTTP ${response.status}`);
  const data = await response.json();
  return (data.organic || []).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
    sourceQuery: query,
  }));
};

const collectSearchResults = async (query) => {
  const providers = [
    process.env.TAVILY_API_KEY && searchWithTavily,
    process.env.SERPER_API_KEY && searchWithSerper,
  ].filter(Boolean);

  for (const provider of providers) {
    try {
      return await provider(query);
    } catch (error) {
      console.warn("[JobDiscovery] search provider failed:", error.message);
    }
  }
  return []; // No provider → return empty, not an error (slugs may cover this)
};

// ─── Slug extraction from ATS URLs ───────────────────────────────────────────

/**
 * Extract { provider, slug } from a direct Greenhouse or Lever URL.
 * Also handles company careers pages by guessing the slug from the hostname.
 *
 * Examples:
 *   boards.greenhouse.io/stripe/jobs/123    → { provider: "Greenhouse", slug: "stripe" }
 *   jobs.lever.co/notion/UUID               → { provider: "Lever",      slug: "notion" }
 *   www.opswat.com/careers/open-positions   → { provider: null,         slug: "opswat" }
 */
const extractSlugFromUrl = (url = "") => {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    // Direct Greenhouse URL
    if (host.includes("greenhouse.io")) {
      const parts = u.pathname.split("/").filter(Boolean);
      return { provider: "Greenhouse", slug: parts[0] || "" };
    }

    // Direct Lever URL
    if (host.includes("lever.co")) {
      const parts = u.pathname.split("/").filter(Boolean);
      return { provider: "Lever", slug: parts[0] || "" };
    }

    // Company custom careers page — extract company name from hostname
    // e.g. opswat.com → "opswat", careers.stripe.com → "stripe"
    const hostParts = host.split(".");
    // Strip common subdomains
    const filtered = hostParts.filter(
      (p) => !["careers", "jobs", "hire", "work", "apply"].includes(p),
    );
    const slug = filtered[0] || "";
    return { provider: null, slug };
  } catch {
    return null;
  }
};

// ─── Role-based filtering of ATS job lists ───────────────────────────────────

/**
 * Given a list of jobs from the ATS API and user preference,
 * return only the jobs that match at least one preferred role or skill.
 * Falls back to returning all jobs if no roles/skills configured.
 */
const filterJobsByRoleMatch = (jobs = [], preference = {}) => {
  const roleTerms = splitTerms(preference.preferredRoles);
  const skillTerms = splitTerms(preference.skills);
  const allTerms = [...roleTerms, ...skillTerms];

  if (!allTerms.length) return jobs; // no filter configured — return all

  return jobs.filter((job) => {
    const haystack = normalize(
      [job.title, job.description, job.company, job.location].join(" "),
    );
    return allTerms.some((term) => {
      // Multi-word terms: every word must match
      const words = term.split(/\s+/).filter((w) => w.length > 2);
      return words.length > 0
        ? words.every((w) => haystack.includes(w))
        : haystack.includes(term);
    });
  });
};

// ─── Search result → ATS jobs resolver ───────────────────────────────────────

/**
 * Given any search result URL (direct ATS URL OR company careers page),
 * resolve it to a list of role-matched ATS jobs.
 *
 * Strategy:
 *   1. If URL is a direct Greenhouse/Lever form URL → fetch that company's
 *      full job list via API, return only role-matched jobs.
 *   2. If URL is a company careers page → extract company slug from hostname,
 *      try Greenhouse API then Lever API, return role-matched jobs.
 *   3. If both fail → discard (never store the careers page URL itself).
 */
const resolveSearchResultToAtsJobs = async (result, preference = {}) => {
  if (!result?.url) return [];

  const slugInfo = extractSlugFromUrl(result.url);
  if (!slugInfo?.slug) {
    console.log(`[JobDiscovery] Could not extract slug from: ${result.url}`);
    return [];
  }

  const { slug } = slugInfo;
  const isDirect = isDirectAtsUrl(result.url);

  // ── Case 1: Direct Greenhouse URL ─────────────────────────────────────────
  if (isDirect && /greenhouse\.io/i.test(result.url)) {
    try {
      const all = await discoverGreenhouseJobs(slug, preference);
      const matched = filterJobsByRoleMatch(all, preference);
      console.log(
        `[JobDiscovery] Greenhouse ${slug}: ${all.length} total, ${matched.length} role-matched.`,
      );
      return matched;
    } catch (err) {
      console.warn(`[JobDiscovery] Greenhouse API failed for ${slug}:`, err.message);
      return [];
    }
  }

  // ── Case 2: Direct Lever URL ───────────────────────────────────────────────
  if (isDirect && /lever\.co/i.test(result.url)) {
    try {
      const all = await discoverLeverJobs(slug, preference);
      const matched = filterJobsByRoleMatch(all, preference);
      console.log(
        `[JobDiscovery] Lever ${slug}: ${all.length} total, ${matched.length} role-matched.`,
      );
      return matched;
    } catch (err) {
      console.warn(`[JobDiscovery] Lever API failed for ${slug}:`, err.message);
      return [];
    }
  }

  // ── Case 3: Company careers page — try Greenhouse then Lever ──────────────
  if (!isDirect) {
    console.log(
      `[JobDiscovery] Careers page detected (${result.url}) — trying ATS APIs for slug "${slug}"`,
    );

    // Try Greenhouse first
    try {
      const all = await discoverGreenhouseJobs(slug, preference);
      if (all.length) {
        const matched = filterJobsByRoleMatch(all, preference);
        console.log(
          `[JobDiscovery] Greenhouse (via careers page) ${slug}: ${all.length} total, ${matched.length} role-matched.`,
        );
        return matched;
      }
    } catch {
      // not on Greenhouse — try Lever
    }

    // Try Lever
    try {
      const all = await discoverLeverJobs(slug, preference);
      if (all.length) {
        const matched = filterJobsByRoleMatch(all, preference);
        console.log(
          `[JobDiscovery] Lever (via careers page) ${slug}: ${all.length} total, ${matched.length} role-matched.`,
        );
        return matched;
      }
    } catch {
      // not on Lever either
    }

    console.log(`[JobDiscovery] No ATS found for careers page slug "${slug}" — skipping.`);
  }

  return [];
};

// ─── Main discovery export ────────────────────────────────────────────────────

/**
 * discoverJobsForPreference
 *
 * Returns an array of job objects where every jobUrl is a direct
 * Greenhouse or Lever application form URL.
 *
 * Discovery order:
 *   1. Slug-based direct API calls (user's atsCompanySlugs list)
 *   2. Search-assisted ATS discovery:
 *      - Search returns any URL (direct ATS or company careers page)
 *      - resolveSearchResultToAtsJobs() converts each to role-matched ATS jobs
 *      - Company careers pages (opswat.com/careers) are resolved via API,
 *        never stored as jobUrl
 */
export const discoverJobsForPreference = async (preference = {}) => {
  // ── Step 1: Direct slug-based ATS discovery ──────────────────────────────
  const directAtsJobs = await discoverDirectAtsJobs(preference);
  console.log(
    `[JobDiscovery] Direct ATS: ${directAtsJobs.length} job(s) from company slugs.`,
  );

  // ── Step 2: Search-assisted ATS discovery ────────────────────────────────
  const searchJobs = [];
  const hasSearchProvider =
    Boolean(process.env.TAVILY_API_KEY) ||
    Boolean(process.env.SERPER_API_KEY);

  if (hasSearchProvider) {
    try {
      const queries = buildAtsSearchQueries(preference);
      const rawResults = [];

      for (const query of queries) {
        const results = await collectSearchResults(query);
        rawResults.push(...results);
      }

      console.log(`[JobDiscovery] Search: ${rawResults.length} raw result(s).`);

      // Deduplicate raw results by URL before resolving
      const seenUrls = new Set();
      const uniqueResults = rawResults.filter((r) => {
        if (!r.url || seenUrls.has(r.url)) return false;
        seenUrls.add(r.url);
        return true;
      });

      // Resolve every result — direct ATS URLs and company careers pages both handled
      const resolved = await Promise.all(
        uniqueResults.map((r) => resolveSearchResultToAtsJobs(r, preference)),
      );
      const flatJobs = resolved.flat();
      console.log(
        `[JobDiscovery] Search resolved: ${flatJobs.length} ATS job(s) from ${uniqueResults.length} result(s).`,
      );
      searchJobs.push(...flatJobs);
    } catch (error) {
      console.warn("[JobDiscovery] Search-assisted discovery failed:", error.message);
    }
  } else {
    console.log(
      "[JobDiscovery] No search provider configured. " +
        "Add TAVILY_API_KEY or SERPER_API_KEY for broader discovery, " +
        "or add company slugs to atsCompanySlugs for direct ATS lookup.",
    );
  }

  // ── Deduplicate and validate ──────────────────────────────────────────────
  const seen = new Set();
  const allJobs = [...directAtsJobs, ...searchJobs];

  return allJobs.filter((job) => {
    if (!isDirectAtsUrl(job.jobUrl)) {
      console.warn(`[JobDiscovery] Rejected non-ATS URL: ${job.jobUrl}`);
      return false;
    }
    const key = makeDuplicateKey(job);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};