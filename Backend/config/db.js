// lib/db.js — YE REPLACE KAR
import mongoose from "mongoose";

let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

const connectDB = async () => {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,  // 5 sec mein fail karo, hang mat karo
      socketTimeoutMS: 10000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null; // reset so next request retry kar sake
    throw e;
  }

  return cached.conn;
};

export default connectDB;