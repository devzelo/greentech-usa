import mongoose from "mongoose";

// The dev link to Atlas is flaky — these lines are the only way to tell a
// mid-session outage (driver reconnects on its own) from an app bug.
mongoose.connection.on("disconnected", () =>
  console.warn("⚠️ MongoDB disconnected — driver keeps retrying in the background.")
);
mongoose.connection.on("reconnected", () => console.log("✅ MongoDB reconnected"));

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set. Add your MongoDB connection string to the environment.");

  // Never give up: on this link TCP handshakes alone can take 5s+ and whole connect
  // attempts drop, and if the process exits, tsx watch only revives it on a file
  // edit — leaving the API dead until someone notices. Retry forever, capped backoff.
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
      console.log("✅ MongoDB connected");
      return;
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).split("\n")[0];
      const delaySec = Math.min(5 * attempt, 30);
      console.warn(
        `⚠️ MongoDB connect attempt ${attempt} failed: ${msg} — retrying in ${delaySec}s… ` +
        `(if this persists, check the network and that this host's IP is allowed in Atlas → Network Access)`
      );
      await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
    }
  }
}
