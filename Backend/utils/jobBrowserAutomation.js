import { mkdir, stat } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionRoot = path.resolve(__dirname, "../storage/browser-sessions");
const activeSessions = new Map();

const SUPPORTED_ATS_HOSTS = ["greenhouse.io", "lever.co"];

const isSupportedAtsUrl = (url = "") => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return SUPPORTED_ATS_HOSTS.some((domain) => host.includes(domain));
  } catch {
    return false;
  }
};

const createAutomationLogger = () => {
  const logs = [];
  return {
    logs,
    add(stage, message, url = "") {
      const entry = { at: new Date(), stage, message, url };
      logs.push(entry);
      console.log(`[JobAutomation] ${stage}: ${message}${url ? ` (${url})` : ""}`);
      return entry;
    },
  };
};

const safeSegment = (value = "") =>
  String(value || "default")
    .replace(/[^a-z0-9_-]/gi, "_")
    .slice(0, 80);

const getSessionId = ({ userId, platform, applicationId }) =>
  [safeSegment(userId), safeSegment(platform), safeSegment(applicationId)].join(
    "__",
  );

const loadPlaywright = async () => {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed. Run: npm install playwright && npx playwright install chromium",
    );
  }
};

const pathExists = async (targetPath) => {
  if (!targetPath) return false;
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
};

const detectCaptcha = async (page) => {
  const text = await page
    .locator("body")
    .innerText({ timeout: 5000 })
    .catch(() => "");
  const lowered = text.toLowerCase();
  const captchaFrameCount = await page
    .locator(
      "iframe[src*='captcha'], iframe[src*='recaptcha'], iframe[src*='hcaptcha']",
    )
    .count()
    .catch(() => 0);
  return (
    captchaFrameCount > 0 ||
    lowered.includes("captcha") ||
    lowered.includes("verify you are human")
  );
};

const dismissPopups = async (page) => {
  const closeSelectors = [
    "button[aria-label='Close']",
    "button[aria-label='close']",
    "button.close",
    "[class*='modal-close']",
    "[class*='popup-close']",
    "[class*='close-btn']",
    "[class*='closeBtn']",
    "svg[class*='close']",
    ".close-button",
    "[data-dismiss='modal']",
  ];

  for (const selector of closeSelectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        await el.click({ timeout: 2000 }).catch(() => null);
        await page.waitForTimeout(500);
      }
    } catch {
      // ignore
    }
  }

  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(300);
};

const inspectFields = async (page) =>
  page
    .locator("input, textarea, select")
    .evaluateAll((fields) =>
      fields.slice(0, 40).map((field) => {
        const id = field.getAttribute("id");
        const label = id
          ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
              ?.textContent
          : "";
        return {
          label: (
            label ||
            field.getAttribute("aria-label") ||
            field.getAttribute("placeholder") ||
            ""
          ).trim(),
          name: field.getAttribute("name") || id || "",
          type:
            field.tagName.toLowerCase() === "textarea"
              ? "textarea"
              : field.getAttribute("type") || field.tagName.toLowerCase(),
          required: Boolean(
            field.required || field.getAttribute("aria-required") === "true",
          ),
          hasValue: Boolean(field.value || field.getAttribute("value")),
        };
      }),
    )
    .catch(() => []);

const FIELD_MAPPERS = {
  fullName: ["full name", "name"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile", "contact"],
  github: ["github", "git hub"],
  linkedin: ["linkedin", "linked in"],
  portfolio: ["portfolio", "website", "personal site"],
  currentLocation: ["location", "city", "address"],
  experienceSummary: ["summary", "about", "cover", "why", "message"],
};

const normalizeFieldText = (value = "") =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const inferProfileKeyForField = (field = {}) => {
  const haystack = normalizeFieldText(
    [field.label, field.name, field.type].filter(Boolean).join(" "),
  );
  return Object.entries(FIELD_MAPPERS).find(([, aliases]) =>
    aliases.some((alias) => haystack.includes(alias)),
  )?.[0];
};

const autofillProfileFields = async ({ page, applyProfile = {} }) => {
  if (!applyProfile?.consentToAutofill) return [];

  const actions = [];
  const fields = await page.locator("input, textarea").elementHandles().catch(() => []);

  for (const field of fields.slice(0, 60)) {
    const meta = await field
      .evaluate((el) => {
        const id = el.getAttribute("id");
        const label = id
          ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent
          : "";
        return {
          label: (
            label ||
            el.getAttribute("aria-label") ||
            el.getAttribute("placeholder") ||
            ""
          ).trim(),
          name: el.getAttribute("name") || id || "",
          type: el.getAttribute("type") || el.tagName.toLowerCase(),
          value: el.value || "",
          disabled: el.disabled || el.readOnly,
        };
      })
      .catch(() => null);

    if (!meta || meta.disabled || meta.value) continue;
    if (["hidden", "file", "submit", "button", "checkbox", "radio"].includes(meta.type)) continue;

    const profileKey = inferProfileKeyForField(meta);
    const value = profileKey ? applyProfile[profileKey] : "";
    if (!value) continue;

    await field.fill(String(value)).catch(() => null);
    actions.push(`Autofilled ${profileKey} from AI Apply Profile.`);
  }

  return [...new Set(actions)];
};

// ✅ FIXED: hover support + wait + applyButton is not defined error gone
const findApplyButton = async (page) => {
  // JS-rendered buttons ke liye wait karo
  await page.waitForTimeout(2000);

  // Page ke main content area pe hover karo (hover-to-show buttons ke liye)
  await page.mouse.move(683, 400).catch(() => null);
  await page.waitForTimeout(500);

  const candidates = [
    page.getByRole("button", {
      name: /^(easy apply|apply now|apply|submit application|submit|send application)$/i,
    }),
    page.locator("input[type='submit']"),
    page.locator("button").filter({ hasText: /apply|submit|send/i }),
  ];

  for (const candidate of candidates) {
    const count = await candidate.count().catch(() => 0);
    for (let index = 0; index < Math.min(count, 3); index += 1) {
      const item = candidate.nth(index);
      // Hover karo item pe bhi — hover-revealed buttons ke liye
      await item.hover().catch(() => null);
      await page.waitForTimeout(200);
      if (await item.isVisible().catch(() => false)) return item;
    }
  }

  return null;
};

const prepareApplicationPage = async ({
  page,
  application,
  resumeFilePath,
  applyProfile,
  logger,
}) => {
  const preparedActions = [];
  const blockers = [];

  logger?.add("prepare_page", "Preparing ATS form.", page.url());
  await dismissPopups(page);

  const captchaDetected = await detectCaptcha(page);
  if (captchaDetected)
    blockers.push("Manual verification or CAPTCHA is required.");

  const detectedFields = await inspectFields(page);
  logger?.add("fields_detected", `${detectedFields.length} field(s) detected.`, page.url());
  preparedActions.push(
    ...(await autofillProfileFields({ page, applyProfile })),
  );
  const fileInputCount = await page
    .locator("input[type='file']")
    .count()
    .catch(() => 0);
  let resumeUploadReady = fileInputCount > 0;

  if (resumeFilePath && fileInputCount > 0) {
    if (await pathExists(resumeFilePath)) {
      await page
        .locator("input[type='file']")
        .first()
        .setInputFiles(resumeFilePath);
      preparedActions.push(
        "Uploaded selected resume to the first resume/file input.",
      );
    } else {
      blockers.push(
        "Resume file path was provided but the file does not exist.",
      );
      resumeUploadReady = false;
    }
  } else if (fileInputCount > 0) {
    preparedActions.push(
      "Detected resume upload field. Resume upload is ready when a file path is provided.",
    );
  }

  const coverNote = application.applicationPackage?.coverNote;
  if (coverNote) {
    const textareas = page.locator("textarea");
    const textareaCount = await textareas.count().catch(() => 0);
    for (let index = 0; index < Math.min(textareaCount, 3); index += 1) {
      const field = textareas.nth(index);
      const hint = [
        await field.getAttribute("name").catch(() => ""),
        await field.getAttribute("aria-label").catch(() => ""),
        await field.getAttribute("placeholder").catch(() => ""),
      ]
        .join(" ")
        .toLowerCase();

      if (/cover|why|message|summary|about|note/.test(hint)) {
        await field.fill(coverNote).catch(() => null);
        preparedActions.push("Prepared cover note / screening text field.");
        break;
      }
    }
  }

  const submitButtons = await page
    .locator("button, input[type='submit']")
    .evaluateAll((buttons) =>
      buttons
        .map(
          (button) =>
            button.innerText ||
            button.value ||
            button.getAttribute("aria-label") ||
            "",
        )
        .filter(Boolean)
        .slice(0, 8),
    )
    .catch(() => []);

  if (submitButtons.some((text) => /submit|apply|send/i.test(text))) {
    preparedActions.push(
      "Detected final application button. User approval is required before submission.",
    );
  }

  if (!preparedActions.length) {
    preparedActions.push(
      "Opened application page and inspected available fields.",
    );
  }

  return {
    captchaDetected,
    detectedFields,
    resumeUploadReady,
    preparedActions,
    blockers,
    approvalGate: true,
  };
};

export const attemptApplicationSubmit = async ({
  userId,
  application,
  resumeFilePath,
  applyProfile,
  keepOpen = false,
}) => {
  const logger = createAutomationLogger();
  const result = await startApplicationAutomation({
    userId,
    application,
    resumeFilePath,
    applyProfile,
    logger,
  });
  const session = activeSessions.get(result.sessionId);
  const blockers = [...(result.blockers || [])];

  if (!session?.page) {
    return {
      ...result,
      status: "failed",
      submitted: false,
      browserOpen: false,
      blockers: ["Browser session could not be started."],
      logs: logger.logs,
    };
  }

  const { page } = session;
  const currentUrl = page.url();
  const needsLogin = /login|signin|auth|account/i.test(currentUrl);

  if (needsLogin && !blockers.some((b) => b.includes("Login is required"))) {
    blockers.push("Login is required before automatic apply can continue.");
  }

  if (result.captchaDetected) {
    blockers.push("CAPTCHA or human verification blocks automatic apply.");
  }

  const requiredMissing = (result.detectedFields || []).filter(
    (field) =>
      field.required &&
      !field.hasValue &&
      !["hidden", "submit", "button", "checkbox", "radio"].includes(
        String(field.type).toLowerCase(),
      ),
  );

  if (requiredMissing.length) {
    blockers.push(
      `Required fields need user input: ${requiredMissing
        .map((f) => f.label || f.name || f.type)
        .slice(0, 5)
        .join(", ")}.`,
    );
  }

  // ✅ FIX: applyButton properly defined — "is not defined" error gone
  const applyButton = await findApplyButton(page);
  if (!applyButton) {
    blockers.push("No clear Apply or Submit button was found on the page.");
  } else {
    logger.add("submit_button_detected", "Final application button detected. Waiting for user review.", page.url());
  }

  if (blockers.length) {
    const shouldKeepOpen = needsLogin || result.captchaDetected || keepOpen;
    if (!shouldKeepOpen) {
      await closeApplicationAutomation({ sessionId: result.sessionId });
    }
    return {
      ...result,
      status: result.captchaDetected
        ? "captcha_required"
        : needsLogin
          ? "needs_login"
          : "blocked",
      submitted: false,
      browserOpen: shouldKeepOpen,
      blockers,
      logs: logger.logs,
    };
  }

  return {
    ...result,
    status: "prepared",
    submitted: false,
    browserOpen: true,
    preparedActions: [
      ...(result.preparedActions || []),
      "Prepared supported ATS form. User final submit is required.",
    ],
    blockers: [],
    logs: logger.logs,
  };
};

export const startApplicationAutomation = async ({
  userId,
  application,
  resumeFilePath,
  applyProfile,
  logger,
}) => {
  if (!application?.jobUrl)
    throw new Error("Job URL is required to start browser automation.");
  if (!isSupportedAtsUrl(application.jobUrl)) {
    throw new Error("Browser automation is restricted to direct Greenhouse and Lever application URLs.");
  }

  const { chromium } = await loadPlaywright();
  logger?.add("browser_launch", "Launching persistent browser context.", application.jobUrl);
  await mkdir(sessionRoot, { recursive: true });

  const sessionId = getSessionId({
    userId,
    platform: application.applicationWorkflow?.platform || application.platform,
    applicationId: application._id,
  });
  const userDataDir = path.join(sessionRoot, sessionId);
  await mkdir(userDataDir, { recursive: true });

  const existing = activeSessions.get(sessionId);
  if (existing?.context) {
    await existing.context.close().catch(() => null);
    activeSessions.delete(sessionId);
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chrome",
    acceptDownloads: true,
    viewport: { width: 1366, height: 900 },
    slowMo: Number(process.env.PLAYWRIGHT_SLOW_MO || 0),
    args: ["--no-first-run", "--no-default-browser-check"],
  });

  context.on("page", (newPage) => {
    logger?.add("popup_detected", "New tab or popup detected.", newPage.url());
    newPage.on("framenavigated", (frame) => {
      if (frame === newPage.mainFrame()) {
        logger?.add("popup_redirect", "Popup navigated.", newPage.url());
      }
    });
  });

  const page = context.pages()[0] || (await context.newPage());
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      logger?.add("redirect_detected", "Main page navigated.", page.url());
    }
  });

  logger?.add("goto", "Opening direct ATS application URL.", application.jobUrl);
  await page.goto(application.jobUrl, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => null);

  const preparation = await prepareApplicationPage({
    page,
    application,
    resumeFilePath,
    applyProfile,
    logger,
  });
  const currentUrl = page.url();
  logger?.add("ats_detected", "Supported ATS page loaded.", currentUrl);
  const needsLogin = /login|signin|auth|account/i.test(currentUrl);

  activeSessions.set(sessionId, {
    context,
    page,
    userId,
    applicationId: String(application._id),
  });

  return {
    sessionId,
    inspectedUrl: currentUrl,
    loginPersisted: true,
    status: preparation.captchaDetected
      ? "captcha_required"
      : needsLogin
        ? "needs_login"
        : "prepared",
    ...preparation,
    logs: logger?.logs || [],
    blockers: [
      ...preparation.blockers,
      ...(needsLogin
        ? [
            "Login is required. Complete login in the opened browser window — session will be saved automatically.",
          ]
        : []),
    ],
  };
};

export const closeApplicationAutomation = async ({ sessionId }) => {
  const session = activeSessions.get(sessionId);
  if (!session) return { closed: false };
  await session.context.close().catch(() => null);
  activeSessions.delete(sessionId);
  return { closed: true };
};
