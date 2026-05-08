import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      default: "",
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"]
    },
    
    password: {
      type: String,
      required: true,
      minlength: 3,
      maxlength: 60,
      select: false,
    },
    avatar: { type: String, default: "" },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default  mongoose.model("User", UserSchema);
