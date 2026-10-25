// Server-side only. Never import this from a client component.
//
// FAMILY_KEYS holds the private family links as "key:label,key:label". Each
// key is a secret path segment on papertelegram.com (one per household, one
// for the printer sticker, one general), and the label names the household so
// the dashboard and the phone push can say who a telegram came through. The
// keys live only in the Vercel environment because this repository is public.
//
// ROOT_MODE decides what the public root does: "live" (the default) keeps
// today's behavior and prints, "demo" turns the root into the public demo
// that sends notes to Justin instead of the printer.

export type FamilyLink = { key: string; label: string };

const KEY_PATTERN = /^[a-z0-9]{8,64}$/;

export function familyLinks(): FamilyLink[] {
  const raw = process.env.FAMILY_KEYS || "";
  const links: FamilyLink[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    const key = (colon >= 0 ? trimmed.slice(0, colon) : trimmed).trim();
    const label = (colon >= 0 ? trimmed.slice(colon + 1) : "").trim() || "Family";
    if (KEY_PATTERN.test(key)) links.push({ key, label: label.slice(0, 40) });
  }
  return links;
}

export function resolveFamilyKey(candidate: string | null | undefined): FamilyLink | null {
  if (!candidate || !KEY_PATTERN.test(candidate)) return null;
  return familyLinks().find((link) => link.key === candidate) ?? null;
}

export type Channel = "family" | "public";

export function rootChannel(): Channel {
  return process.env.ROOT_MODE === "demo" ? "public" : "family";
}

export function familyLinkUrl(key: string): string {
  return `https://papertelegram.com/${key}`;
}
