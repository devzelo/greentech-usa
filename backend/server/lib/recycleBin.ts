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
