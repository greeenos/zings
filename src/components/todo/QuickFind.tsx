import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Inbox,
  Keyboard,
  Layers,
  ListTodo,
  Plus,
  Search,
  Settings,
  Star,
  TimerReset,
  Trash2,
  UserRound,
} from "@/lib/icons";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { FolderOpen, Tag as TagIcon } from "@/lib/icons";
import { Area, Project, Todo, View } from "@/types/todo";
import { localDateKey } from "@/lib/date";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todos: Todo[];
  projects: Project[];
  areas?: Area[];
  tags?: string[];
  onNavigate: (view: View) => void;
  onNewTodo: () => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  onOpenShortcuts: () => void;
}

const destinations: Array<{
  label: string;
  keywords: string;
  view: View;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
}> = [
  { label: "Inbox", keywords: "capture", view: { kind: "list", id: "inbox" }, icon: Inbox, shortcut: "1" },
  { label: "Today", keywords: "dnes", view: { kind: "list", id: "today" }, icon: Star, shortcut: "2" },
  { label: "Upcoming", keywords: "future schedule", view: { kind: "list", id: "upcoming" }, icon: TimerReset },
  { label: "Anytime", keywords: "available", view: { kind: "list", id: "anytime" }, icon: Layers, shortcut: "3" },
  { label: "Someday", keywords: "later maybe", view: { kind: "list", id: "someday" }, icon: ListTodo },
  { label: "Logbook", keywords: "completed archive", view: { kind: "list", id: "logbook" }, icon: CheckCircle2, shortcut: "4" },
  { label: "Calendar", keywords: "dates month schedule", view: { kind: "calendar", tab: "schedule" }, icon: CalendarDays, shortcut: "6" },
  { label: "Activity", keywords: "time analytics tracked calendar", view: { kind: "calendar", tab: "activity" }, icon: Activity, shortcut: "5" },
  { label: "Trash", keywords: "deleted bin kos", view: { kind: "trash" }, icon: Trash2 },
];

function viewForTodo(todo: Todo): View {
  if (todo.completed) return { kind: "list", id: "logbook" };
  if (todo.projectId) return { kind: "project", id: todo.projectId };
  if (todo.dueDate && todo.dueDate > localDateKey()) return { kind: "list", id: "upcoming" };
  return { kind: "list", id: todo.list };
}

export default function QuickFind({
  open,
  onOpenChange,
  todos,
  projects,
  areas = [],
  tags = [],
  onNavigate,
  onNewTodo,
  onOpenSettings,
  onOpenAccount,
  onOpenShortcuts,
}: Props) {
  const closeAnd = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  const projectName = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Find a task, project, or destination…" />
      <CommandList className="max-h-[min(62vh,520px)]">
        <CommandEmpty>No matching tasks or lists.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem value="new todo task create add" onSelect={() => closeAnd(onNewTodo)}>
            <Plus className="mr-2 h-4 w-4 text-primary" />
            New to-do
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem value="settings preferences appearance theme reminders" onSelect={() => closeAnd(onOpenSettings)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
          <CommandItem value="account sign out encryption backup export feed" onSelect={() => closeAnd(onOpenAccount)}>
            <UserRound className="mr-2 h-4 w-4" />
            Account
          </CommandItem>
          <CommandItem value="keyboard shortcuts help" onSelect={() => closeAnd(onOpenShortcuts)}>
            <Keyboard className="mr-2 h-4 w-4" />
            Keyboard shortcuts
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Go to">
          {destinations.map(({ label, keywords, view, icon: Icon, shortcut }) => (
            <CommandItem
              key={label}
              value={`${label} ${keywords}`}
              onSelect={() => closeAnd(() => onNavigate(view))}
            >
              <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {label}
              {shortcut && <CommandShortcut>{shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
          {areas.map((area) => (
            <CommandItem
              key={area.id}
              value={`area ${area.name}`}
              onSelect={() => closeAnd(() => onNavigate({ kind: "area", id: area.id }))}
            >
              <FolderOpen className="mr-2 h-4 w-4 text-muted-foreground" />
              {area.name}
              <CommandShortcut>Area</CommandShortcut>
            </CommandItem>
          ))}
          {projects.map((project) => (
            <CommandItem
              key={project.id}
              value={`project ${project.name}`}
              onSelect={() => closeAnd(() => onNavigate({ kind: "project", id: project.id }))}
            >
              <span
                className="mr-3 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              {project.name}
              <CommandShortcut>Project</CommandShortcut>
            </CommandItem>
          ))}
          {tags.map((tag) => (
            <CommandItem
              key={tag}
              value={`tag ${tag}`}
              onSelect={() => closeAnd(() => onNavigate({ kind: "tag", id: tag }))}
            >
              <TagIcon className="mr-2 h-4 w-4 text-muted-foreground" />
              {tag}
              <CommandShortcut>Tag</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        {todos.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {todos.slice(0, 80).map((todo) => (
                <CommandItem
                  key={todo.id}
                  value={`todo ${todo.title} ${projectName.get(todo.projectId ?? "") ?? todo.list}`}
                  onSelect={() => closeAnd(() => onNavigate(viewForTodo(todo)))}
                >
                  <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{todo.title}</span>
                  <CommandShortcut className="max-w-28 truncate normal-case tracking-normal">
                    {projectName.get(todo.projectId ?? "") ?? todo.list}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
