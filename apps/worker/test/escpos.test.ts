import assert from "node:assert/strict";
import test from "node:test";
import { buildMessageReceipt, sanitizeReceiptText, wrapReceiptText } from "../src/escpos.js";

test("sanitizes receipt text to printable ASCII", () => {
  assert.equal(sanitizeReceiptText("  Héllo\tSeattle 👋  "), "Hello Seattle ?");
});

test("wraps and splits long words at the printer width", () => {
  assert.deepEqual(wrapReceiptText("one two three", 7), ["one two", "three"]);
  assert.deepEqual(wrapReceiptText("abcdefgh", 4), ["abcd", "efgh"]);
});

test("receipt initializes the printer and ends with full cut", () => {
  const receipt = buildMessageReceipt(
    {
      id: "00000000-0000-0000-0000-000000000001",
      publicId: "msg_test",
      sequenceNumber: 42,
      senderName: "Alex",
      messageText: "Hope this works.",
      submittedAt: "2026-08-05T05:00:00.000Z",
      expiresAt: "2026-08-05T05:10:00.000Z",
    },
    "America/Los_Angeles",
  );

  assert.deepEqual([...receipt.subarray(0, 2)], [0x1b, 0x40]);
  assert.deepEqual([...receipt.subarray(-3)], [0x1d, 0x56, 0x00]);
  assert.match(receipt.toString("ascii"), /Message #0042/);
  assert.match(receipt.toString("ascii"), /Hope this works\./);
});
