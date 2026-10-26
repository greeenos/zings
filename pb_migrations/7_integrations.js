/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  // Personal REST API (Shortcuts, Zapier, scripts) and email-to-task address.
  users.fields.add(new TextField({ name: "apiToken", autogeneratePattern: "[a-z0-9]{32}" }));
  users.fields.add(new TextField({ name: "mailToken", autogeneratePattern: "[a-z0-9]{24}" }));
  // POSTed on to-do created / completed.
  users.fields.add(new URLField({ name: "webhookUrl" }));
  // Subscribed .ics calendars shown next to the to-dos: [{ url, name }].
  users.fields.add(new JSONField({ name: "calendars", maxSize: 20000 }));
  // The user's own Anthropic key. Hidden: the API never returns it, the client only
  // sees aiKeyHint ("…a1b2"), set by a hook whenever the key changes.
  users.fields.add(new TextField({ name: "aiKey", hidden: true, max: 300 }));
  users.fields.add(new TextField({ name: "aiKeyHint", max: 10 }));
  app.save(users);

  // Rows that existed before this migration get their tokens now.
  for (const user of app.findAllRecords("users")) {
    user.set("apiToken", $security.randomStringWithAlphabet(32, "abcdefghijklmnopqrstuvwxyz0123456789"));
    user.set("mailToken", $security.randomStringWithAlphabet(24, "abcdefghijklmnopqrstuvwxyz0123456789"));
    app.save(user);
  }

  // Fetched .ics bodies, refreshed every 15 minutes. Hooks only.
  app.save(new Collection({
    type: "base",
    name: "calendar_cache",
    fields: [
      { name: "url", type: "text", max: 2000, required: true },
      { name: "body", type: "text", max: 5000000 },
      { name: "fetched", type: "number" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_calendar_cache_url ON calendar_cache (url)"],
  }));
});
