import type { Document } from "mongoose";
import RecycleBin from "../models/RecycleBin";

// Move a snapshot of a deleted record into the recycle bin. Best-effort — a failure here must never
// block the delete itself.
export async function moveToTrash(input: {
  kind: string;
  refId: string;
  projectId?: string;
  projectName?: string;
  name: string;
  subtitle?: string;
  data: unknown;
  extra?: unknown;
  files?: Array<{ filePath: string }>;
  deletedById?: string;
  deletedByName?: string;
}): Promise<void> {
  try {
    await RecycleBin.create({
      kind: input.kind,
      refId: input.refId,
      projectId: input.projectId || "",
      projectName: input.projectName || "",
      name: input.name,
      subtitle: input.subtitle || "",
      data: input.data,
      extra: input.extra ?? null,
      files: (input.files || []).filter((f) => f && f.filePath),
      deletedById: input.deletedById || "",
      deletedByName: input.deletedByName || "",
    });
  } catch {
    /* recycle bin is best-effort */
  }
}

// Snapshot a Mongoose document to the recycle bin, then delete it. The one-liner every route uses so
// deletes become recoverable. `data` is the whole document, so restore re-creates it via Model.create.
export async function recycleAndDelete(
  doc: Document,
  meta: {
    kind: string; refId?: string; name: string; subtitle?: string;
    projectId?: string; projectName?: string; extra?: unknown;
    files?: Array<{ filePath: string }>; deletedById?: string; deletedByName?: string;
  },
): Promise<void> {
  await moveToTrash({
    ...meta,
    refId: meta.refId || String((doc as unknown as { _id: unknown })._id),
    data: doc.toObject(),
  });
  await doc.deleteOne();
}
