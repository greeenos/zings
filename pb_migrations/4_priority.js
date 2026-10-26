/// <reference path="../pb_data/types.d.ts" />

// Priority 0 (none) … 3 (high), typed as ! / !! / !!! in a title.
migrate((app) => {
  const todos = app.findCollectionByNameOrId("todos");
  todos.fields.add(new NumberField({ name: "priority", min: 0, max: 3, onlyInt: true }));
  app.save(todos);
});
