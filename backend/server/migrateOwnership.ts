/**
 * One-time migration: stamp every existing project with an ownerId.
 *
 * By default, the admin user (admin@greentech-usa.com) becomes the owner of all
 * un-owned projects so they appear in their "My Projects" view immediately.
 *
 *   npx tsx server/migrateOwnership.ts
 *   npx tsx server/migrateOwnership.ts --ownerEmail someone@gt-usa.com
 */
import "dotenv/config";
import { connectDB } from "./config/db";
import User from "./models/User";
import Project from "./models/Project";

function arg(name: string): string | undefined {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  await connectDB();

  const ownerEmail = (arg("ownerEmail") || "admin@greentech-usa.com").toLowerCase();
  const owner = await User.findOne({ email: ownerEmail });
  if (!owner) {
    console.error(`No user found with email ${ownerEmail}. Run server/createUser.ts first.`);
    process.exit(1);
  }

  const result = await Project.updateMany(
    { $or: [{ ownerId: null }, { ownerId: { $exists: false } }] },
    { $set: { ownerId: owner._id, owner: owner.name } }
  );
  console.log(`Stamped ${result.modifiedCount} project(s) with owner: ${owner.name} (${ownerEmail}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
