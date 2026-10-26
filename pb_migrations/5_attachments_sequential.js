/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // Files and pasted images on a to-do. Protected: only readable with a
  // short-lived file token, so a leaked URL stops working within minutes.
  const todos = app.findCollectionByNameOrId("todos");
  todos.fields.add(new FileField({
    name: "attachments",
    maxSelect: 20,
    maxSize: 25 * 1024 * 1024,
    protected: true,
    thumbs: ["240x240"],
  }));
  app.save(todos);

  // A sequential project shows only its next open to-do in Today and Anytime.
  const projects = app.findCollectionByNameOrId("projects");
  projects.fields.add(new BoolField({ name: "sequential" }));
  app.save(projects);
});
