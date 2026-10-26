/**
 * PocketBase stores "no value" as "" in text columns and 0 in number columns,
 * where the app's types use null. Every row read from the server (client and
 * server hooks alike) passes through here.
 */
const NULL_IF_EMPTY = [
  "notes", "completedAt", "startedAt", "projectId", "headingId", "dueDate",
  "dueTime", "deadline", "deletedAt", "color", "areaId",
];
const NULL_IF_ZERO = ["lastedMs", "estimateMin", "priority"];
const SERVER_ONLY = ["collectionId", "collectionName", "owner", "expand"];

export function fromRecord<T>(record: object): T {
  const row: Record<string, unknown> = { ...record };
  // Who created the row: tells a shared project's owner from its members.
  if (typeof row.owner === "string") row.ownerId = row.owner;
  for (const key of SERVER_ONLY) delete row[key];
  for (const key of NULL_IF_EMPTY) if (row[key] === "") row[key] = null;
  for (const key of NULL_IF_ZERO) if (row[key] === 0) row[key] = null;
  return row as T;
}
