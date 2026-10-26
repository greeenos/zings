/// <reference path="../pb_data/types.d.ts" />

// The whole Zings schema. Column names match the app's TypeScript types 1:1;
// nullable dates/ids are plain text ("" = none) so values round-trip unchanged.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  // Per-user secret for the read-only calendar feed.
  users.fields.add(new TextField({ name: "feedToken", autogeneratePattern: "[a-z0-9]{32}" }));
  users.authToken.duration = 90 * 24 * 3600;
  app.save(users);

  const own = "owner = @request.auth.id";
  const keepOwner = "(@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";
  const text = (name, max = 10000) => ({ name, type: "text", max });
  const number = (name) => ({ name, type: "number" });
  const bool = (name) => ({ name, type: "bool" });
  const json = (name) => ({ name, type: "json" });

  const collection = (name, fields) =>
    app.save(new Collection({
      type: "base",
      name,
      listRule: own,
      viewRule: own,
      createRule: `@request.auth.id != "" && ${own}`,
      updateRule: `${own} && ${keepOwner}`,
      deleteRule: own,
      fields: [
        // Client-minted UUIDs, so offline-created rows and backups keep their ids.
        {
          name: "id", type: "text", primaryKey: true, system: true, required: true,
          pattern: "^[a-z0-9-]+$", min: 15, max: 36, autogeneratePattern: "[a-z0-9]{15}",
        },
        { name: "owner", type: "relation", collectionId: users.id, required: true, cascadeDelete: true, maxSelect: 1 },
        ...fields,
        number("sortOrder"),
        text("createdAt"),
      ],
      indexes: [`CREATE INDEX idx_${name}_owner ON ${name} (owner)`],
    }));

  collection("areas", [text("name"), text("color")]);
  collection("projects", [text("name"), text("color"), text("areaId")]);
  collection("headings", [text("projectId"), text("name")]);
  collection("todos", [
    text("title"),
    text("notes", 1000000),
    bool("completed"),
    text("completedAt"),
    text("startedAt"),
    number("lastedMs"),
    text("list"),
    text("projectId"),
    text("headingId"),
    text("dueDate"),
    text("dueTime"),
    bool("evening"),
    text("deadline"),
    number("estimateMin"),
    json("checklist"),
    json("tags"),
    json("repeatRule"),
    number("streak"),
    text("deletedAt"),
  ]);


  // Multi-row writes (bulk edits, backup import) go through the batch API.
  const settings = app.settings();
  settings.meta.appName = "Zings";
  settings.batch.enabled = true;
  settings.batch.maxRequests = 500;
  app.save(settings);
});
