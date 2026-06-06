import mongoose from "mongoose";
import { decryptValue, encryptValue } from "../utils/encryption.js";

const encryptedString = {
  type: String,
  default: "",
  set: (value) => encryptValue(value),
  get: (value) => decryptValue(value),
};

const AIApplyProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    fullName: encryptedString,
    email: encryptedString,
    phone: encryptedString,
    github: encryptedString,
    linkedin: encryptedString,
    portfolio: encryptedString,
    resumeFilePath: encryptedString,
    experienceSummary: encryptedString,
    currentLocation: encryptedString,
    workAuthorization: encryptedString,
    consentToAutofill: { type: Boolean, default: false },
    onboardingCompleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

AIApplyProfileSchema.methods.toSafeObject = function toSafeObject() {
  const data = this.toObject({ getters: true });
  delete data.__v;
  return data;
};

export default mongoose.model("AIApplyProfile", AIApplyProfileSchema);
