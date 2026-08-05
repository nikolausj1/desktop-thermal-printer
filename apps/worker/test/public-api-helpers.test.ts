import assert from "node:assert/strict";
import test from "node:test";
import {
  moderateMessage,
  normalizeMessage,
  normalizeName,
} from "../../../supabase/functions/_shared/public-api-helpers.js";

test("normalizes optional names and enforces the length limit", () => {
  assert.deepEqual(normalizeName("  Alex   N.  "), { ok: true, value: "Alex N." });
  assert.deepEqual(normalizeName(""), { ok: true, value: "" });
  assert.equal(normalizeName("x".repeat(31)).ok, false);
});

test("normalizes message whitespace while preserving useful line breaks", () => {
  assert.deepEqual(normalizeMessage(" Hello  there\r\n\r\n\r\nSeattle "), {
    ok: true,
    value: "Hello there\n\nSeattle",
  });
  assert.equal(normalizeMessage(" \n ").ok, false);
  assert.equal(normalizeMessage("x".repeat(301)).ok, false);
});

test("rejects printer controls and excessive line breaks", () => {
  assert.equal(normalizeMessage("hello\u001b@printer").ok, false);
  assert.equal(normalizeMessage(Array.from({ length: 10 }, () => "line").join("\n")).ok, false);
});

test("rejects repetitive, threatening, and sensitive content", () => {
  assert.equal(moderateMessage("aaaaaaaaaaaaaaaa").ok, false);
  assert.equal(moderateMessage("hello hello hello hello hello hello hello hello hello").ok, false);
  assert.equal(moderateMessage("I will hurt you").ok, false);
  assert.equal(moderateMessage("My password is swordfish").ok, false);
  assert.equal(moderateMessage("Hope you are having a great day in Seattle!").ok, true);
});
