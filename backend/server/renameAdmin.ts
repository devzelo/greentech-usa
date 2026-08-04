import "dotenv/config";
import { connectDB } from "./config/db";
import User from "./models/User";

// One-off: rename the default admin account to the client's name (Reza), keeping the
// existing login email + password ("original for later"). Only the display name + role change.
async function run() {
  await connectDB();

  const email = "admin@greentech-usa.com";
  const newName = "Reza Esfandiari";

  const user = await User.findOneAndUpdate(
    { email },
    { name: newName, role: "admin" },
    { new: true }
  ).select("-password -resetToken -resetTokenExpiry");

  if (!user) {
    console.error(`❌ No account found for ${email}. Nothing changed.`);
    process.exit(1);
  }

  console.log(`✅ Renamed ${email} → "${user.name}" (role: ${user.role}). Login credentials unchanged.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Rename failed:", err);
  process.exit(1);
});
