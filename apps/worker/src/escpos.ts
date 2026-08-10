import type { PrintJob } from "./types.js";

const ESC = 0x1b;
const GS = 0x1d;
const FONT_A_WIDTH = 48;

function command(...bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

function ascii(value: string): Buffer {
  return Buffer.from(value, "ascii");
}

function line(value = ""): Buffer {
  return ascii(`${value}\n`);
}

export function sanitizeReceiptText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\t\v\f]+/g, " ")
    .replace(/[^\x20-\x7e\n]/gu, "?")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function wrapReceiptText(value: string, width = FONT_A_WIDTH): string[] {
  const output: string[] = [];

  for (const paragraph of value.split("\n")) {
    if (!paragraph.trim()) {
      output.push("");
      continue;
    }

    let current = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      if (word.length > width) {
        if (current) {
          output.push(current);
          current = "";
        }
        for (let index = 0; index < word.length; index += width) {
          output.push(word.slice(index, index + width));
        }
        continue;
      }

      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= width) {
        current = candidate;
      } else {
        output.push(current);
        current = word;
      }
    }

    if (current) {
      output.push(current);
    }
  }

  return output;
}

function seattleTimestamp(isoTimestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoTimestamp));
}

export function buildOriginSummary(
  deviceLabel: string | null,
  locationLabel: string | null,
): string | null {
  const device = sanitizeReceiptText(deviceLabel || "device").slice(0, 40) || "device";
  const location = sanitizeReceiptText(locationLabel || "").slice(0, 220);
  if (!deviceLabel && !location) return null;

  const article = /^(?:Android|iPad|iPhone)\b/u.test(device) ? "an" : "a";
  return `Sent from ${article} ${device}${location ? ` near ${location}` : ""}`;
}

const RECIPIENT_PREFIX = /^FOR (VINNY|CHASE)\n+/u;

// Messages sent before recipient became a first-class field carry a
// "FOR CHASE" first line instead. Either way the receipt gets the
// dedicated header and the prefix never prints twice.
export function resolveRecipient(job: PrintJob): {
  recipient: string | null;
  messageText: string;
} {
  if (job.recipient) {
    return { recipient: job.recipient, messageText: job.messageText };
  }
  const match = job.messageText.match(RECIPIENT_PREFIX);
  const name = match?.[1];
  if (match && name) {
    return {
      recipient: name.charAt(0) + name.slice(1).toLowerCase(),
      messageText: job.messageText.slice(match[0].length),
    };
  }
  return { recipient: null, messageText: job.messageText };
}

function footerLabel(theme: string | null | undefined): string {
  if (theme === "owl-post") return "SENT BY OWL POST";
  if (theme === "airmail") return "SENT BY AIRMAIL";
  return "SENT FROM THE INTERNET";
}

export function buildMessageReceipt(job: PrintJob, timezone: string): Buffer {
  const sender = sanitizeReceiptText(job.senderName || "ANONYMOUS").slice(0, 30);
  const resolved = resolveRecipient(job);
  const recipient = resolved.recipient
    ? sanitizeReceiptText(resolved.recipient).slice(0, 10).toUpperCase()
    : null;
  const message = sanitizeReceiptText(resolved.messageText);
  const originSummary = buildOriginSummary(job.deviceLabel, job.locationLabel);
  if (!message) {
    throw new Error("Message is empty after receipt sanitization.");
  }

  const chunks: Buffer[] = [
    command(ESC, 0x40),
    command(ESC, 0x74, 0x00),
    command(ESC, 0x4d, 0x00),
    command(ESC, 0x61, 0x01),
    command(ESC, 0x45, 0x01),
  ];

  if (recipient) {
    // Small line over the big name, so the kids see whose it is first.
    chunks.push(
      line("MESSAGE FOR"),
      command(GS, 0x21, 0x11),
      line(recipient),
      command(GS, 0x21, 0x00),
    );
  } else {
    chunks.push(
      command(GS, 0x21, 0x11),
      line("MESSAGE"),
      command(GS, 0x21, 0x00),
      line("FROM THE INTERNET"),
    );
  }

  chunks.push(
    command(ESC, 0x45, 0x00),
    line(),
    command(ESC, 0x61, 0x00),
    line("=".repeat(FONT_A_WIDTH)),
    command(ESC, 0x45, 0x01),
    line(`FROM: ${sender}`),
    command(ESC, 0x45, 0x00),
  );

  if (originSummary) {
    for (const wrappedLine of wrapReceiptText(originSummary)) {
      chunks.push(line(wrappedLine));
    }
  }

  chunks.push(line());

  for (const wrappedLine of wrapReceiptText(message)) {
    chunks.push(line(wrappedLine));
  }

  chunks.push(
    line(),
    line("-".repeat(FONT_A_WIDTH)),
    line(`Message #${String(job.sequenceNumber).padStart(4, "0")}`),
    line(seattleTimestamp(job.submittedAt, timezone)),
    line(),
    command(ESC, 0x61, 0x01),
    command(ESC, 0x45, 0x01),
    line(footerLabel(job.theme)),
    command(ESC, 0x45, 0x00),
    command(ESC, 0x64, 0x05),
    command(GS, 0x56, 0x00),
  );

  return Buffer.concat(chunks);
}
