import { useCallback, useEffect, useState } from "react";
import { Group, X } from "@/lib/icons";
import { errorMessage, pb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { DialogSection, DialogShell } from "@/components/todo/DialogShell";
import type { Project } from "@/types/todo";

interface Member {
  id: string;
  email: string;
  name: string;
  owner: boolean;
}

/** Who a project is shared with; the owner invites by email, members can leave. */
export function ShareDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const me = pb.authStore.record?.id;
  const isOwner = !!project && (!project.ownerId || project.ownerId === me);

  const load = useCallback(async () => {
    if (!project) return;
    try {
      const res = await pb.send<{ items: Member[] }>(`/api/share/members?projectId=${encodeURIComponent(project.id)}`, {});
      setMembers(res.items);
    } catch {
      setMembers([]);
    }
  }, [project]);

  useEffect(() => {
    setEmail("");
    void load();
  }, [load]);

  const call = async (path: string, body: object, done: string) => {
    setBusy(true);
    try {
      await pb.send(path, { method: "POST", body });
      toast.success(done);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "That didn't work"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    if (!project || !email.trim()) return;
    if (await call("/api/share/invite", { projectId: project.id, email }, `Shared with ${email.trim()}`)) {
      setEmail("");
      void load();
    }
  };

  const remove = async (member: Member) => {
    if (!project) return;
    const leaving = member.id === me;
    if (await call("/api/share/remove", { projectId: project.id, userId: member.id }, leaving ? "You left the project" : `Removed ${member.name}`)) {
      // Access changed: take the server's view of every list.
      window.dispatchEvent(new Event("zings:resync"));
      if (leaving) onClose();
      else void load();
    }
  };

  return (
    <DialogShell
      open={!!project}
      onClose={onClose}
      title={project ? `Share “${project.name}”` : "Share"}
      subtitle="Everyone here sees and edits the project's to-dos."
      icon={<Group className="h-[18px] w-[18px]" />}
    >
      <DialogSection icon={<Group className="h-4 w-4 text-primary" />} title="People">
        <ul className="mt-3 space-y-1">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold uppercase text-accent-foreground">
                {m.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.name}{m.id === me && " (you)"}</span>
                <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
              </span>
              {m.owner ? (
                <span className="text-xs text-muted-foreground">Owner</span>
              ) : (isOwner || m.id === me) && (
                <button
                  onClick={() => void remove(m)}
                  disabled={busy}
                  className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label={m.id === me ? "Leave project" : `Remove ${m.name}`}
                >
                  {m.id === me ? "Leave" : <X className="h-3.5 w-3.5" />}
                </button>
              )}
            </li>
          ))}
        </ul>

        {isOwner && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void invite();
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Their Zings email"
              className="min-w-0 flex-1 rounded-lg bg-background/70 px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="btn-3d btn-primary btn-sm"
            >
              Invite
            </button>
          </form>
        )}
      </DialogSection>
    </DialogShell>
  );
}
