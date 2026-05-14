
import mongoose from "mongoose";

const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGO_URI);
  console.log("connected to db");
  return conn;
};

export default connectDB;