/// <reference path="../pb_data/types.d.ts" />

// The AI key can be Anthropic's or OpenRouter's (any model it routes to).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new SelectField({ name: "aiProvider", values: ["anthropic", "openrouter"], maxSelect: 1 }));
  // OpenRouter model id, e.g. "openrouter/auto" or "anthropic/claude-sonnet-4.5".
  users.fields.add(new TextField({ name: "aiModel", max: 100 }));
  app.save(users);
});
