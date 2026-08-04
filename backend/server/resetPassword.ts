import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDB } from "./config/db";
import User from "./models/User";

async function reset() {
  await connectDB();

  const email = "admin@greentech-usa.com";
  const newPassword = "Greentech2026";
  const hashed = await bcrypt.hash(newPassword, 12);

  const result = await User.findOneAndUpdate(
    { email },
    {
      name: "John Partner",
      email,
      password: hashed,
      role: "admin",
      resetToken: undefined,
      resetTokenExpiry: undefined,
    },
    { upsert: true, new: true }
  );

  console.log(`âœ… Password reset for ${result.email}`);
  console.log(`   Login: ${email} / ${newPassword}`);
  process.exit(0);
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
