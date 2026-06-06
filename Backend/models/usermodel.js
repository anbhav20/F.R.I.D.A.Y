import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      default: "",
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    // password removed — OAuth only
    avatar:      { type: String,  default: "" },
    verified:    { type: Boolean, default: true },
    firebaseUid: { type: String,  default: null },
    provider:    { type: String,  default: null }, // "google.com" / "github.com"
    refreshToken:{ type: String,  default: null, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);