import mongoose from "mongoose";

const JobPreferenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    preferredRoles: [{ type: String, trim: true }],
    skills: [{ type: String, trim: true }],
    experienceLevel: {
      type: String,
      enum: ["fresher", "intern", "junior", "mid", "senior", "any"],
      default: "any",
    },
    salaryExpectation: { type: String, trim: true, default: "" },
    preferredLocations: [{ type: String, trim: true }],
    workMode: {
      type: String,
      enum: ["remote", "hybrid", "onsite", "any"],
      default: "any",
    },
    engagementType: {
      type: String,
      enum: ["internship", "full-time", "part-time", "contract", "any"],
      default: "any",
    },
    industries: [{ type: String, trim: true }],
    companyTypes: [{ type: String, trim: true }],
    workTiming: { type: String, trim: true, default: "" },
    preferredPlatforms: [{
      type: String,
      enum: [
        "Naukri",
        "LinkedIn",
        "Internshala",
        "WorkIndia",
        "Foundit",
        "Indeed",
        "Company Careers",
        "Startup Jobs",
        "Remote Jobs",
        "Fresher Portals",
        "Greenhouse",
        "Lever",
        "Workday",
      ],
    }],
    atsCompanySlugs: [{ type: String, trim: true }],
    savedCompanies: [{ type: String, trim: true }],
    blacklistedCompanies: [{ type: String, trim: true }],
    emailReportsEnabled: { type: Boolean, default: true },
    autoApplyEnabled: { type: Boolean, default: false },
    minimumMatchScore: { type: Number, default: 70, min: 0, max: 100 },
    resumeVersions: [
      {
        name: { type: String, trim: true, required: true },
        content: { type: String, default: "" },
        isDefault: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("JobPreference", JobPreferenceSchema);
