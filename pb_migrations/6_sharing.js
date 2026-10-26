/// <reference path="../pb_data/types.d.ts" />

// Shared projects: a project's members see and edit its headings and to-dos as
// if they were their own. Rows keep their creator as `owner`; access through a
// project is granted by the rules below, so nothing is copied between accounts.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const me = "@request.auth.id";

  const projects = app.findCollectionByNameOrId("projects");
  projects.fields.add(new RelationField({ name: "members", collectionId: users.id, maxSelect: 50 }));
  const member = `(owner = ${me} || members.id ?= ${me})`;
  projects.listRule = member;
  projects.viewRule = member;
  // Members may rename or reorder; only the owner changes who is in it (via the
  // /api/share hooks) and only the owner deletes it.
  projects.updateRule =
    `(owner = ${me} && (@request.body.owner:isset = false || @request.body.owner = ${me})) || ` +
    `(members.id ?= ${me} && @request.body.owner:isset = false && @request.body.members:isset = false)`;
  app.save(projects);

  // A row is reachable through its project when the caller owns or belongs to it.
  // One alias per check keeps "id matches" and "caller belongs" on the same project row.
  const via = (field, alias) =>
    `(${field} != "" && @collection.projects:${alias}.id ?= ${field} && ` +
    `(@collection.projects:${alias}.owner ?= ${me} || @collection.projects:${alias}.members.id ?= ${me}))`;
  // Writes may only point a row at a project the caller can reach.
  const target = (field, alias) =>
    `(@request.body.${field}:isset = false || @request.body.${field} = "" || ${via(`@request.body.${field}`, alias)})`;
  const keepOwner = `(@request.body.owner:isset = false || @request.body.owner = owner)`;

  for (const name of ["todos", "headings"]) {
    const c = app.findCollectionByNameOrId(name);
    const visible = `(owner = ${me} || ${via("projectId", "p")})`;
    c.listRule = visible;
    c.viewRule = visible;
    c.createRule = `${me} != "" && owner = ${me} && ${target("projectId", "t")}`;
    c.updateRule = `${visible} && ${keepOwner} && ${target("projectId", "t")}`;
    c.deleteRule = visible;
    app.save(c);
  }
});
