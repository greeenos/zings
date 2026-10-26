/// <reference path="../pb_data/types.d.ts" />

// Hosted instances (ZINGS_HOSTED=1) sell Pro by Stripe subscription or a
// crypto payment. Self-hosted instances never read any of this.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  // ISO date the paid period runs to; empty = free. Set by billing hooks only
  // (a request hook refuses it from clients).
  users.fields.add(new TextField({ name: "paidUntil", max: 40 }));
  users.fields.add(new TextField({ name: "stripeCustomer", hidden: true, max: 100 }));
  // So a payment reminder goes out once per period.
  users.fields.add(new TextField({ name: "renewalNotice", hidden: true, max: 40 }));
  app.save(users);

  // Every settled payment, keyed by the provider's id so a retried webhook
  // never extends Pro twice. Hooks only.
  app.save(new Collection({
    type: "base",
    name: "payments",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, cascadeDelete: false, maxSelect: 1 },
      { name: "provider", type: "text", max: 20 },
      { name: "externalId", type: "text", max: 200, required: true },
      { name: "amount", type: "number" },
      { name: "currency", type: "text", max: 10 },
      { name: "paidUntil", type: "text", max: 40 },
      { name: "created", type: "autodate", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_payments_external ON payments (provider, externalId)"],
  }));
});
