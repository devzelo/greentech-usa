/**
 * CLI: create a new employee login.
 *
 *   npx tsx server/createUser.ts --name "Sara Mensah" --email sara@gt-usa.com --password "Welcome123!" --empId EMP-002
 *
 * Flags: --name, --email, --password are required.
 *        --empId, --phone, --role (default "employee"), --avatarUrl are optional.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDB } from "./config/db";
import User from "./models/User";

function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const name = arg("name");
  const email = arg("email");
  const password = arg("password");
  const empId = arg("empId") || "";
  const phone = arg("phone") || "";
  const role = (arg("role") || "employee") as "admin" | "employee";
  const avatarUrl = arg("avatarUrl") || "";

  if (!name || !email || !password) {
    console.error("Usage: npx tsx server/createUser.ts --name <name> --email <email> --password <password> [--empId <id>] [--phone <p>] [--role employee|admin]");
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.error(`A user with email ${email} already exists.`);
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password: hashed,
    role,
    empId,
    phone,
    avatarUrl,
  });

  console.log(`Created user:`);
  console.log(`  id:    ${user._id}`);
  console.log(`  name:  ${user.name}`);
  console.log(`  email: ${user.email}`);
  console.log(`  empId: ${user.empId || "(none)"}`);
  console.log(`  role:  ${user.role}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
