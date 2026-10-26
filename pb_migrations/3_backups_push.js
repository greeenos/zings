/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // A nightly snapshot of the whole data directory, last seven kept
  // (pb_data/backups; restore from the dashboard's Backups page).
  const settings = app.settings();
  settings.backups.cron = "0 3 * * *";
  settings.backups.cronMaxKeep = 7;
  app.save(settings);

  const users = app.findCollectionByNameOrId("users");
  const own = "owner = @request.auth.id";

  // One row per browser that asked for reminders.
  app.save(new Collection({
    type: "base",
    name: "push_subscriptions",
    listRule: own,
    viewRule: own,
    createRule: `@request.auth.id != "" && ${own}`,
    deleteRule: own,
    fields: [
      { name: "owner", type: "relation", collectionId: users.id, required: true, cascadeDelete: true, maxSelect: 1 },
      { name: "endpoint", type: "text", required: true, max: 2000 },
      { name: "keys", type: "json" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions (endpoint)"],
  }));

  // Reminder text waiting for a woken service worker. Hooks only.
  app.save(new Collection({
    type: "base",
    name: "push_outbox",
    fields: [
      { name: "endpoint", type: "text", max: 2000 },
      { name: "title", type: "text", max: 10000 },
      { name: "body", type: "text" },
      { name: "tag", type: "text" },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_push_outbox_endpoint ON push_outbox (endpoint)"],
  }));

  // The server's VAPID key pair, made on first use. Hooks only.
  app.save(new Collection({
    type: "base",
    name: "push_keys",
    fields: [
      { name: "publicKey", type: "text", max: 200 },
      { name: "privateKey", type: "text", max: 200 },
    ],
  }));
});
