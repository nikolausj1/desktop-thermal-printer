import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMessageReceipt,
  buildOriginSummary,
  resolveRecipient,
  sanitizeReceiptText,
  wrapReceiptText,
} from "../src/escpos.js";
import type { PrintJob } from "../src/types.js";

const baseJob: PrintJob = {
  id: "00000000-0000-0000-0000-000000000001",
  publicId: "msg_test",
  sequenceNumber: 42,
  senderName: "Alex",
  messageText: "Hope this works.",
  submittedAt: "2026-08-05T05:00:00.000Z",
  expiresAt: "2026-08-05T05:10:00.000Z",
  deviceLabel: "iPhone",
  locationLabel: "Portland, OR",
};

test("sanitizes receipt text to printable ASCII", () => {
  assert.equal(sanitizeReceiptText("  Héllo\tSeattle 👋  "), "Hello Seattle ?");
});

test("wraps and splits long words at the printer width", () => {
  assert.deepEqual(wrapReceiptText("one two three", 7), ["one two", "three"]);
  assert.deepEqual(wrapReceiptText("abcdefgh", 4), ["abcd", "efgh"]);
});

test("receipt initializes the printer and ends with full cut", () => {
  const receipt = buildMessageReceipt(baseJob, "America/Los_Angeles");

  assert.deepEqual([...receipt.subarray(0, 2)], [0x1b, 0x40]);
  assert.deepEqual([...receipt.subarray(-3)], [0x1d, 0x56, 0x00]);
  assert.match(receipt.toString("ascii"), /Message #0042/);
  assert.match(receipt.toString("ascii"), /Hope this works\./);
  assert.match(receipt.toString("ascii"), /Sent from an iPhone near Portland, OR/);
  // 2x2 MESSAGE, size reset, then the small FROM THE INTERNET line.
  assert.match(receipt.toString("ascii"), /\x1d!\x11MESSAGE\n\x1d!\x00FROM THE INTERNET/);
  assert.match(receipt.toString("ascii"), /SENT FROM THE INTERNET/);
});

test("first-class recipient prints the small-over-big header", () => {
  const receipt = buildMessageReceipt(
    { ...baseJob, recipient: "Chase", theme: "owl-post" },
    "America/Los_Angeles",
  );
  const text = receipt.toString("ascii");

  // MESSAGE FOR at normal size, then 2x2 size (GS ! 0x11) before CHASE.
  assert.match(text, /MESSAGE FOR\n\x1d!\x11CHASE\n/);
  assert.match(text, /SENT BY OWL POST/);
  assert.doesNotMatch(text, /FROM THE INTERNET/);
});

test("legacy FOR-prefixed messages get the header and lose the prefix", () => {
  const receipt = buildMessageReceipt(
    { ...baseJob, messageText: "FOR VINNY\n\nHappy birthday!" },
    "America/Los_Angeles",
  );
  const text = receipt.toString("ascii");

  assert.match(text, /MESSAGE FOR\n\x1d!\x11VINNY\n/);
  assert.match(text, /Happy birthday!/);
  assert.doesNotMatch(text, /FOR VINNY\n\nHappy/);
});

test("resolveRecipient prefers the field and falls back to the prefix", () => {
  assert.deepEqual(resolveRecipient({ ...baseJob, recipient: "Vinny" }), {
    recipient: "Vinny",
    messageText: "Hope this works.",
  });
  assert.deepEqual(resolveRecipient({ ...baseJob, messageText: "FOR CHASE\nHi there" }), {
    recipient: "Chase",
    messageText: "Hi there",
  });
  assert.deepEqual(resolveRecipient(baseJob), {
    recipient: null,
    messageText: "Hope this works.",
  });
});

test("theme picks the matching footer and defaults safely", () => {
  const airmail = buildMessageReceipt({ ...baseJob, theme: "airmail" }, "America/Los_Angeles");
  assert.match(airmail.toString("ascii"), /SENT BY AIRMAIL/);

  const unknown = buildMessageReceipt({ ...baseJob, theme: "mystery" }, "America/Los_Angeles");
  assert.match(unknown.toString("ascii"), /SENT FROM THE INTERNET/);
});

test("origin summary falls back cleanly when location or all metadata is missing", () => {
  assert.equal(buildOriginSummary("iPhone", null), "Sent from an iPhone");
  assert.equal(
    buildOriginSummary("Windows computer", "Seattle, WA"),
    "Sent from a Windows computer near Seattle, WA",
  );
  assert.equal(buildOriginSummary(null, null), null);
});

test("an unaddressed Paper Telegram is addressed to both kids", () => {
  const receipt = buildMessageReceipt({ ...baseJob, theme: "airmail" }, "America/Los_Angeles");
  const text = receipt.toString("ascii");

  assert.match(text, /MESSAGE FOR\n\x1d!\x11VINNY & CHASE\n/);
  assert.match(text, /SENT BY AIRMAIL/);
});

test("a desk-printer message keeps the generic header", () => {
  // No theme and no recipient: this came from justinnikolaus.com/printer,
  // which shares the queue and is not addressed to the kids at all.
  const receipt = buildMessageReceipt(baseJob, "America/Los_Angeles");
  const text = receipt.toString("ascii");

  assert.match(text, /\x1d!\x11MESSAGE\n\x1d!\x00FROM THE INTERNET/);
  assert.doesNotMatch(text, /VINNY & CHASE/);
});
