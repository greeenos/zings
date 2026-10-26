import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { Todo } from "@/types/todo";

const todos: Todo[] = [
  {
    id: "t1",
    title: "Ship the release",
    completed: false,
    list: "today",
    createdAt: "2026-07-20T08:00:00.000Z",
    dueDate: "2026-07-20",
  },
  {
    id: "t2",
    title: "Archived chore",
    completed: true,
    list: "logbook",
    createdAt: "2026-07-19T08:00:00.000Z",
    completedAt: "2026-07-19T09:00:00.000Z",
    lastedMs: 3_600_000,
  },
  {
    id: "t3",
    title: "Dinner with friends",
    completed: false,
    list: "today",
    evening: true,
    createdAt: "2026-07-20T08:30:00.000Z",
    dueDate: "2026-07-20",
  },
  {
    id: "t4",
    title: "Tax return",
    completed: false,
    // Planned for far in the future, but the deadline has already passed —
    // Things surfaces this in Today, and so should Zings.
    list: "anytime",
    dueDate: "2099-01-01",
    deadline: "2026-07-01",
    createdAt: "2026-07-18T08:00:00.000Z",
  },
  {
    id: "t5",
    title: "Deleted thing",
    completed: false,
    list: "today",
    dueDate: "2026-07-20",
    deletedAt: "2026-07-21T10:00:00.000Z",
    createdAt: "2026-07-17T08:00:00.000Z",
  },
  {
    id: "t6",
    title: "Practice German",
    completed: false,
    list: "today",
    repeatRule: { freq: "day", interval: 1, from: "schedule" },
    streak: 4,
    createdAt: "2026-07-20T07:30:00.000Z",
  },
];

// A stand-in for the PocketBase data layer: every write succeeds, only todos have rows.
vi.mock("@/lib/db", () => ({
  pb: { authStore: { record: { email: "me@example.com", feedToken: "" }, clear: () => {}, onChange: () => () => {} }, buildURL: (p: string) => p },
  listAll: async (table: string) => ({ data: table === "todos" ? todos : [], error: null }),
  idsWhere: async () => [],
  insert: async () => null,
  upsert: async () => null,
  update: async () => null,
  remove: async () => null,
  subscribe: () => () => {},
}));

describe("Index", () => {
  it("renders the Today list once todos have loaded", async () => {
    const { default: Index } = await import("./Index");
    render(<Index />);

    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(await screen.findByText("Ship the release")).toBeInTheDocument();
    // Completed work belongs to the Logbook, not Today.
    expect(screen.queryByText("Archived chore")).not.toBeInTheDocument();
  });

  it("splits This Evening out of the daytime work", async () => {
    const { default: Index } = await import("./Index");
    render(<Index />);

    await screen.findByText("Ship the release");
    expect(screen.getByText("This Evening")).toBeInTheDocument();
    expect(screen.getByText("Dinner with friends")).toBeInTheDocument();
  });

  it("pulls a passed deadline into Today even when the task is scheduled later", async () => {
    const { default: Index } = await import("./Index");
    render(<Index />);

    await screen.findByText("Ship the release");
    expect(screen.getByText("Tax return")).toBeInTheDocument();
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
  });

  it("keeps soft-deleted to-dos out of every list but Trash", async () => {
    const { default: Index } = await import("./Index");
    render(<Index />);

    await screen.findByText("Ship the release");
    expect(screen.queryByText("Deleted thing")).not.toBeInTheDocument();
    // …and the sidebar offers a way back to it.
    expect(screen.getByText("Trash")).toBeInTheDocument();
  });

  it("opens the action row when a to-do is clicked", async () => {
    const { default: Index } = await import("./Index");
    render(<Index />);

    fireEvent.click(await screen.findByText("Ship the release"));

    // The row of one-tap actions Things puts inside an open to-do.
    expect(await screen.findByText("Deadline")).toBeInTheDocument();
    expect(screen.getByText("Repeat")).toBeInTheDocument();
    expect(screen.getByText("Checklist")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
  });

  it("shows collapsed repeat metadata as a labelled line and its detail when opened", async () => {
    const { default: Index } = await import("./Index");
    render(<Index />);

    const title = await screen.findByText("Practice German");
    const row = title.closest('[data-todo-id="t6"]');
    expect(row).not.toBeNull();

    const compactMeta = row!.querySelector("[data-collapsed-meta]");
    expect(compactMeta).not.toBeNull();
    expect(title.parentElement).toContainElement(compactMeta as HTMLElement);
    expect(title).toHaveClass("truncate");

    const repeatStatus = within(row as HTMLElement).getByRole("img", { name: "Repeats: Every day" });
    expect(within(repeatStatus).getByText("Every day")).toBeVisible();
    expect(within(row as HTMLElement).getByRole("img", { name: "4 in a row, on time" })).toBeInTheDocument();

    fireEvent.click(title);

    expect(await within(row as HTMLElement).findByText("Every day · 4🔥")).toBeInTheDocument();
    expect(row!.querySelector("[data-collapsed-meta]")).toBeNull();
  });

  it("shows an illustrated empty state for a list with nothing in it", async () => {
    const { default: Index } = await import("./Index");
    render(<Index />);

    await screen.findByText("Ship the release");
    fireEvent.keyDown(window, { key: "1" }); // Inbox — nothing is filed there

    expect(await screen.findByText("Your inbox is empty")).toBeInTheDocument();
    expect(screen.getByText("Capture every thought here.")).toBeInTheDocument();
  });

  it("keeps the deferred overlays out of the first render", async () => {
    const { default: Index } = await import("./Index");
    render(<Index />);

    await waitFor(() => expect(screen.getByText("Ship the release")).toBeInTheDocument());
    // Settings / Quick Find / shortcuts are lazy: nothing of theirs is mounted
    // until the user actually opens one.
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Find a task/i)).not.toBeInTheDocument();
  });
});
