import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const getEncryptionKey = () => {
  const secret =
    process.env.APPLY_PROFILE_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    process.env.GENERATE_TOKEN_SECRET ||
    "ai-job-agent-local-development-key";

  return crypto.createHash("sha256").update(String(secret)).digest();
};

export const encryptValue = (value = "") => {
  const plainText = String(value || "");
  if (!plainText) return "";

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted]
    .map((part) => part.toString("base64"))
    .join(".");
};

export const decryptValue = (value = "") => {
  if (!value) return "";

  try {
    const [ivRaw, authTagRaw, encryptedRaw] = String(value).split(".");
    if (!ivRaw || !authTagRaw || !encryptedRaw) return "";

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getEncryptionKey(),
      Buffer.from(ivRaw, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTagRaw, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
};
