import { Project } from "@/types/todo";

const INBOX_LABEL = "Inbox";
const INBOX_COLOR = "hsl(var(--muted-foreground))";

interface ProjectMeta {
  name: string;
  color: string;
}

/** Looks up a project's display name/color by id, falling back to Inbox. */
export function buildProjectLookup(projects: Project[]): (id: string | null) => ProjectMeta {
  const map = new Map<string, ProjectMeta>();
  for (const p of projects) map.set(p.id, { name: p.name, color: p.color || INBOX_COLOR });
  return (id: string | null) => (id && map.has(id) ? map.get(id)! : { name: INBOX_LABEL, color: INBOX_COLOR });
}
