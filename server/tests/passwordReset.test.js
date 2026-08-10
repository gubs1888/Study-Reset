import assert from "node:assert/strict";
import test from "node:test";
import { createPasswordResetToken, hashPasswordResetToken } from "../services/passwordReset.js";

test("password reset tokens are random and stored as hashes", () => {
  const first = createPasswordResetToken();
  const second = createPasswordResetToken();

  assert.notEqual(first.token, second.token);
  assert.notEqual(first.token, first.tokenHash);
  assert.equal(hashPasswordResetToken(first.token), first.tokenHash);
  assert.ok(first.expiresAt.getTime() > Date.now());
});
