/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CR 297: renumber every existing project to the four-digit GT number (see lib/projectNumber).
 *
 *   npx tsx server/renumberProjects.ts            # dry run: prints what it would do, writes nothing
 *   npx tsx server/renumberProjects.ts --apply    # makes the change
 *
 * A project's number is its key everywhere: every project-scoped row carries it, every uploaded
 * file sits under uploads/<number>/, and it is in the project's web address. So this moves all
 * three together, the rows, the folder on disk and the paths stored inside the rows, and records
 * the old number on the project so a link saved earlier still opens it.
 *
 * Numbers are handed out oldest project first within each year, and a project that already has a
 * correct number for its year keeps it, so a second run changes nothing.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import Project from "./models/Project";
import Agreement from "./models/Agreement";
import { yearPrefix } from "./lib/projectNumber";

// Every project-scoped collection, imported for the side effect of registering the model, so the
// sweep below finds them from the schemas rather than from a list that would fall out of date.
import "./models/DocumentFolder";
import "./models/Expense";
import "./models/FolderNote";
import "./models/Invoice";
import "./models/MeetingMinute";
import "./models/ProcurementEvent";
import "./models/ProcurementItem";
import "./models/ProcurementItemRevision";
import "./models/ProcurementPO";
import "./models/ProcurementRow";
import "./models/ProcurementSection";
import "./models/ProjectDocument";
import "./models/ProjectRequest";
import "./models/ProjectTable";
import "./models/ProposalRevision";
import "./models/PurchaseOrder";
import "./models/RecycleBin";
import "./models/Reminder";
import "./models/Resume";
import "./models/Rfq";
import "./models/SavedDocument";
import "./models/ScheduleRevision";
import "./models/Shipment";
import "./models/SubAgreement";
import "./models/SubInvoice";
import "./models/SubResume";
import "./models/Submittal";
import "./models/SubmittalRevision";
import "./models/Task";
import "./models/TaskColumn";
import "./models/TechnicalDoc";
import "./models/Vendor";
import "./models/VendorQuote";

const APPLY = process.argv.includes("--apply");
// --revert <mapping file> puts every number in that file back, for when the change has to be undone.
const REVERT = (() => { const i = process.argv.indexOf("--revert"); return i === -1 ? "" : process.argv[i + 1] || ""; })();
const UPLOADS = "uploads";

/** Rewrite "uploads/<old>/..." to "uploads/<new>/..." in every string of a document. */
function remapPaths<T>(doc: T, oldPid: string, newPid: string): T {
  const esc = oldPid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(uploads[\\/\\\\])" + esc + "([\\/\\\\])", "g");
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return v.replace(re, "$1" + newPid + "$2");
    if (v == null) return v;
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Date || v instanceof mongoose.Types.ObjectId || Buffer.isBuffer(v)) return v;
    if (typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = walk(val);
      return o;
    }
    return v;
  };
  return walk(doc) as T;
}

/** The collections that carry a project number, found from the schemas themselves. */
function scopedModels(): mongoose.Model<any>[] {
  return mongoose.modelNames()
    .map((n) => mongoose.model(n))
    .filter((M) => M.modelName !== "Project" && !!M.schema.path("projectId"));
}

/** Move one project's rows, files and stored paths from one number to another. */
async function moveProject(oldPid: string, newPid: string): Promise<Record<string, number>> {
  const touched: Record<string, number> = {};

  for (const M of scopedModels()) {
    const rows = await M.find({ projectId: oldPid }).lean();
    if (!rows.length) continue;
    touched[M.modelName] = rows.length;
    if (!APPLY) continue;
    for (const r of rows) {
      const next: any = remapPaths({ ...(r as any) }, oldPid, newPid);
      next.projectId = newPid;
      delete next._id;
      await M.updateOne({ _id: (r as any)._id }, { $set: next });
    }
  }

  // An agreement names the projects it covers, under its own field rather than projectId.
  const agreements = await Agreement.find({ "linkedProjects.id": oldPid }).lean();
  if (agreements.length) {
    touched.Agreement = agreements.length;
    if (APPLY) {
      for (const a of agreements) {
        const linked = (a as any).linkedProjects.map((l: any) => (l.id === oldPid ? { ...l, id: newPid } : l));
        await Agreement.updateOne({ _id: (a as any)._id }, { $set: { linkedProjects: linked } });
      }
    }
  }

  // The files on disk.
  const src = path.join(UPLOADS, oldPid);
  if (fs.existsSync(src)) {
    touched["uploads folder"] = 1;
    if (APPLY) fs.renameSync(src, path.join(UPLOADS, newPid));
  }

  // The project document itself, keeping the number it used to carry.
  const proj: any = await Project.findOne({ projectId: oldPid }).lean();
  if (proj && APPLY) {
    const next: any = remapPaths({ ...proj }, oldPid, newPid);
    next.projectId = newPid;
    next.previousIds = Array.from(new Set([...(proj.previousIds || []), oldPid]))
      .filter((v) => v !== newPid && !String(v).startsWith("tmp-"));
    delete next._id;
    await Project.updateOne({ _id: proj._id }, { $set: next });
  }
  return touched;
}

async function main() {
  await connectDB();

  if (REVERT) {
    const saved: Array<{ name: string; from: string; to: string }> = JSON.parse(fs.readFileSync(REVERT, "utf8"));
    console.log("");
    console.log("putting " + saved.length + " number" + (saved.length === 1 ? "" : "s") + " back" + (APPLY ? "" : "  (dry run: nothing is written)"));
    console.log("");
    for (const row of saved) console.log("  " + row.to.padEnd(14) + " -> " + row.from + "   " + row.name);
    const parkedBack = new Map<string, string>();
    for (const row of saved) {
      const tmp = "tmp-" + Math.random().toString(36).slice(2, 10);
      parkedBack.set(row.to, tmp);
      if (APPLY) await moveProject(row.to, tmp);
    }
    for (const row of saved) {
      await moveProject(APPLY ? parkedBack.get(row.to)! : row.to, row.from);
      // the number it is going back to is no longer a previous one
      if (APPLY) await Project.updateOne({ projectId: row.from }, { $pull: { previousIds: row.from } });
    }
    console.log("");
    console.log(APPLY ? "done." : "nothing was written. run it again with --apply.");
    await mongoose.disconnect();
    return;
  }

  const projects: any[] = await Project.find({})
    .select("projectId name contractDate contractYear createdAt")
    .sort({ createdAt: 1 })
    .lean();

  // Group by the year the number should start with, oldest project first.
  const byYear = new Map<string, any[]>();
  for (const p of projects) {
    const fallbackYear = String(new Date(p.createdAt || Date.now()).getFullYear());
    const yy = yearPrefix(p.contractDate, p.contractYear || fallbackYear);
    byYear.set(yy, [...(byYear.get(yy) || []), p]);
  }

  const plan: Array<{ name: string; from: string; to: string }> = [];
  for (const [yy, list] of byYear) {
    const correct = new RegExp("^" + yy + "[0-9]{2,}$");
    // A project already numbered correctly for its year keeps that number.
    const taken = new Set(list.filter((p) => correct.test(p.projectId)).map((p) => p.projectId));
    let n = 0;
    const nextFree = () => {
      let id = "";
      do { n += 1; id = yy + String(n).padStart(2, "0"); } while (taken.has(id));
      taken.add(id);
      return id;
    };
    for (const p of list) {
      if (correct.test(p.projectId)) continue;
      plan.push({ name: p.name, from: p.projectId, to: nextFree() });
    }
  }

  const note = APPLY ? "" : "  (dry run: nothing is written)";
  console.log("\n" + projects.length + " project" + (projects.length === 1 ? "" : "s") + ", " + plan.length + " to renumber" + note + "\n");
  for (const row of plan) console.log("  " + row.from.padEnd(14) + " -> " + row.to + "   " + row.name);
  if (!plan.length) {
    console.log("  every project already carries a four-digit number.");
    await mongoose.disconnect();
    return;
  }

  // Two steps, so a number freed by one project can be taken by another without the two colliding
  // on the unique index while both are in flight.
  const parked = new Map<string, string>();
  for (const row of plan) {
    const tmp = "tmp-" + Math.random().toString(36).slice(2, 10);
    parked.set(row.from, tmp);
    if (APPLY) await moveProject(row.from, tmp);
  }
  const totals: Record<string, number> = {};
  for (const row of plan) {
    const touched = await moveProject(APPLY ? parked.get(row.from)! : row.from, row.to);
    for (const [k, v] of Object.entries(touched)) totals[k] = (totals[k] || 0) + v;
  }

  console.log("\nrows carrying the number:");
  for (const [k, v] of Object.entries(totals).sort((a, b) => b[1] - a[1])) console.log("  " + k.padEnd(24) + " " + v);

  if (APPLY) {
    const mapFile = path.join(UPLOADS, "renumber-" + new Date().toISOString().slice(0, 10) + ".json");
    fs.writeFileSync(mapFile, JSON.stringify(plan, null, 2));
    console.log("\ndone. the mapping is in " + mapFile + ", and the old numbers still open their projects.");
  } else {
    console.log("\nnothing was written. run it again with --apply to make the change.");
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
