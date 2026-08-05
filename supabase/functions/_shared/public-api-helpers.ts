export const MESSAGE_MAX_LENGTH = 300;
export const NAME_MAX_LENGTH = 30;
export const MAX_LINE_BREAKS = 8;

export type ValidationResult =
  | { ok: true; value: string }
  | { ok: false; code: string };

const forbiddenControlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

export function normalizeName(value: unknown): ValidationResult {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: "" };
  }
  if (typeof value !== "string" || forbiddenControlCharacters.test(value)) {
    return { ok: false, code: "invalid_name" };
  }
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if ([...normalized].length > NAME_MAX_LENGTH) {
    return { ok: false, code: "invalid_name" };
  }
  return { ok: true, value: normalized };
}

export function normalizeMessage(value: unknown): ValidationResult {
  if (typeof value !== "string" || forbiddenControlCharacters.test(value)) {
    return { ok: false, code: "invalid_message" };
  }

  const normalized = value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\v\f]+/g, " ")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lineBreaks = (normalized.match(/\n/g) || []).length;
  if (
    normalized.length === 0 ||
    [...normalized].length > MESSAGE_MAX_LENGTH ||
    lineBreaks > MAX_LINE_BREAKS
  ) {
    return { ok: false, code: "invalid_message" };
  }

  return { ok: true, value: normalized };
}

export function moderateMessage(message: string): ValidationResult {
  if (/(.)\1{14,}/su.test(message)) {
    return { ok: false, code: "repeated_characters" };
  }

  const words = message.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}']+/gu) || [];
  if (words.length >= 8) {
    const frequencies = new Map<string, number>();
    for (const word of words) frequencies.set(word, (frequencies.get(word) || 0) + 1);
    const highestFrequency = Math.max(...frequencies.values());
    if (highestFrequency / words.length > 0.65) {
      return { ok: false, code: "repetitive_content" };
    }
  }

  const blockedPatterns = [
    /\b(?:kill|murder|shoot|stab|bomb|hurt)\s+(?:you|justin|him|her|them|your family)\b/iu,
    /\b(?:child porn|rape|sexual assault)\b/iu,
    /\b(?:death to|exterminate)\s+(?:all\s+)?[\p{L}]+\b/iu,
    /\b(?:password|api key|secret key)\s+(?:is|:)\s*\S+/iu,
    /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/u,
    /\b(?:\d[ -]*?){13,19}\b/u,
  ];

  if (blockedPatterns.some((pattern) => pattern.test(message))) {
    return { ok: false, code: "blocked_content" };
  }

  const links = message.match(/https?:\/\//giu) || [];
  if (links.length > 2) {
    return { ok: false, code: "link_spam" };
  }

  return { ok: true, value: message };
}
