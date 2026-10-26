/// <reference path="../pb_data/types.d.ts" />

// Note encryption settings live on the account, so every device can unlock
// with the passphrase. Neither value is secret: the salt is random and the
// verifier is a known string encrypted with the passphrase-derived key.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new TextField({ name: "cipherSalt" }));
  users.fields.add(new TextField({ name: "cipherVerifier" }));
  app.save(users);
});
