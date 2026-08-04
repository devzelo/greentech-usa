import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set. Add your MongoDB connection string to the environment.");

  try {
    // Fail fast (10s) with a clear message rather than hanging, if the DB is unreachable.
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log("✅ MongoDB connected");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not connect to MongoDB. Check MONGO_URI and that this host's IP is allowed in ` +
      `Atlas → Network Access (0.0.0.0/0 to allow all). Underlying error: ${msg}`
    );
  }
}
