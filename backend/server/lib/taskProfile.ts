import Project from "../models/Project";
import TaskColumn from "../models/TaskColumn";
import type { ITask } from "../models/Task";

// CR-P — enrich raw tasks with their project name + column title for the profile "campaign" views
// (a user's tasks on their profile; a company's tasks on the Directory profile).
export interface ProfileTask {
  _id: string; title: string; projectId: string; projectName: string;
  columnTitle: string; columnOrder: number;
  tags: string[]; assignees: ITask["assignees"];
  subtasksDone: number; subtasksTotal: number;
}

export async function enrichTasks(tasks: Array<Record<string, unknown>>): Promise<ProfileTask[]> {
  const projIds = [...new Set(tasks.map((t) => String(t.projectId)))];
  const colIds = [...new Set(tasks.map((t) => String(t.columnId)))];
  const [projects, columns] = await Promise.all([
    Project.find({ _id: { $in: projIds } }).select("name").lean(),
    TaskColumn.find({ _id: { $in: colIds } }).select("title order").lean(),
  ]);
  const projName = new Map(projects.map((p) => [String((p as { _id: unknown })._id), String((p as { name?: string }).name || "")]));
  const colInfo = new Map(columns.map((c) => [String((c as { _id: unknown })._id), { title: String((c as { title?: string }).title || ""), order: Number((c as { order?: number }).order ?? 99) }]));
  return tasks.map((t) => {
    const subs = Array.isArray(t.subtasks) ? (t.subtasks as Array<{ done?: boolean }>) : [];
    const col = colInfo.get(String(t.columnId));
    return {
      _id: String(t._id),
      title: String(t.title || ""),
      projectId: String(t.projectId || ""),
      projectName: projName.get(String(t.projectId)) || "",
      columnTitle: col?.title || "Other",
      columnOrder: col?.order ?? 99,
      tags: Array.isArray(t.tags) ? (t.tags as string[]) : [],
      assignees: (Array.isArray(t.assignees) ? t.assignees : []) as ITask["assignees"],
      subtasksDone: subs.filter((s) => s.done).length,
      subtasksTotal: subs.length,
    };
  });
}
