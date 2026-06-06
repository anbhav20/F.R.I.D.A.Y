import nodemailer from "nodemailer";

// ─────────────────────────────────────────────
// Report Builder
// ─────────────────────────────────────────────
export const buildDailyReport = (applications = []) => {
  if (!applications.length) {
    return {
      subject: "Daily job discovery report",
      body: "No new matching job listings were discovered in this run.",
    };
  }

  const lines = applications.map((app, index) => {
    const appliedAt = app.appliedAt
      ? new Date(app.appliedAt).toLocaleString("en-IN")
      : "Not applied yet";

    return [
      `${index + 1}. ${app.title} - ${app.company}`,
      `   Platform : ${app.platform}`,
      `   Applied  : ${appliedAt}`,
      `   Status   : ${app.status}`,
      `   Workflow : ${app.applicationSupportLevel || "guided"}${app.supportedPlatform ? " (supported)" : ""}`,
      `   Salary   : ${app.salary || "Not available"}`,
      `   Location : ${app.location || "Not available"}`,
      `   Link     : ${app.jobUrl || "Not available"}`,
    ].join("\n");
  });

  const appliedCount = applications.filter((a) => a.status === "Applied").length;

  const body = [
    `Daily Job Discovery Report`,
    `Generated: ${new Date().toLocaleString("en-IN")}`,
    `─────────────────────────────────`,
    `Total listings : ${applications.length}`,
    `Auto-applied   : ${appliedCount}`,
    `─────────────────────────────────`,
    "",
    ...lines,
    "",
    "─────────────────────────────────",
    "Sent by your AI Job Agent",
  ].join("\n");

  return {
    subject: `Job Report — ${appliedCount} applied, ${applications.length} tracked`,
    body,
  };
};

export const buildApplySuccessReport = (application = {}) => ({
  subject: `Application submitted: ${application.title} at ${application.company}`,
  body: [
    "Hello,",
    "",
    "Your AI Job Agent successfully applied to:",
    "",
    `Role: ${application.title}`,
    `Company: ${application.company}`,
    `Platform: ${application.platform}`,
    "",
    "Application Status: Applied Successfully",
    "",
    "The application workflow completed successfully.",
    "",
    "Thank you for using AI Job Agent",
  ].join("\n"),
});

// ─────────────────────────────────────────────
// Nodemailer via Gmail (Primary — Backend)
// ─────────────────────────────────────────────
const sendViaNodemailer = async ({ to, report }) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,  // your Gmail address
      pass: process.env.GMAIL_PASS,  // Gmail App Password (not your login password)
    },
  });

  await transporter.sendMail({
    from: `"AI Job Agent" <${process.env.GMAIL_USER}>`,
    to,
    subject: report.subject,
    text: report.body,
  });

  return { provider: "nodemailer_gmail" };
};

// ─────────────────────────────────────────────
// SMTP fallback (optional — for non-Gmail)
// ─────────────────────────────────────────────
const sendViaSMTP = async ({ to, report }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.REPORT_FROM_EMAIL || process.env.SMTP_USER,
    to,
    subject: report.subject,
    text: report.body,
  });

  return { provider: "smtp" };
};

// ─────────────────────────────────────────────
// Main sender — tries Gmail first, then SMTP
// EmailJS fallback is handled on the FRONTEND
// (see JobAgent.jsx emailReport function)
// ─────────────────────────────────────────────
export const sendDailyReportEmail = async ({ to, report }) => {
  if (!to) throw new Error("Recipient email is required.");
  if (!report?.subject || !report?.body) throw new Error("Report content is missing.");

  // 1️⃣ Try Gmail via Nodemailer
  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    try {
      return await sendViaNodemailer({ to, report });
    } catch (err) {
      console.warn("[EmailReport] Gmail failed, trying SMTP:", err.message);
    }
  }

  // 2️⃣ Try custom SMTP
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      return await sendViaSMTP({ to, report });
    } catch (err) {
      console.warn("[EmailReport] SMTP failed:", err.message);
    }
  }

  // 3️⃣ Neither configured — tell frontend to use EmailJS
  // Frontend will catch this specific error and fall back to EmailJS
  throw new Error("BACKEND_EMAIL_UNAVAILABLE");
};
