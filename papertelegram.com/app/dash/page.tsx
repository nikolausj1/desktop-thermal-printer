import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "../../lib/db";
import { familyLinks, familyLinkUrl, rootChannel } from "../../lib/family-keys";
import { CopyButton } from "./copy-button";
import "./dash.css";

// Private admin dashboard. Not linked from anywhere on the public site.
//
// Auth: a shared-secret query param (?key=...) checked against
// process.env.DASH_KEY. This is intentionally the simplest correct option:
// a server component's render path has no access to the outgoing Response,
// so it cannot set a cookie itself, and adding a route handler just to mint
// a "remember me" cookie is more moving parts than a private, unlinked,
// family-only dashboard needs. Bookmark the URL with ?key= included.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paper Telegram — Dashboard",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type MessageRow = {
  public_id: string;
  sequence_number: number | null;
  sender_name: string | null;
  message_text: string;
  recipient: string | null;
  theme: string | null;
  status: string;
  source: string | null;
  household: string | null;
  submitted_at: string;
  sent_to_printer_at: string | null;
  failure_message: string | null;
  device_label: string | null;
  location_label: string | null;
};

// Telegrams and public demo notes share one table and one fetch; the page
// splits them. 300 covers months of family traffic.
const FETCH_LIMIT = 300;

async function fetchMessages(): Promise<MessageRow[]> {
  // Read through the site's database role (see lib/db.ts); the function
  // behind this is the only table access that role has.
  const sql = db();
  const rows = await sql`select * from public.get_dashboard_messages(${FETCH_LIMIT})`;
  return rows.map((row) => ({
    public_id: String(row.public_id),
    sequence_number: row.sequence_number === null ? null : Number(row.sequence_number),
    sender_name: (row.sender_name as string | null) ?? null,
    message_text: String(row.message_text),
    recipient: (row.recipient as string | null) ?? null,
    theme: (row.theme as string | null) ?? null,
    status: String(row.status),
    source: (row.source as string | null) ?? null,
    household: (row.household as string | null) ?? null,
    submitted_at: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : String(row.submitted_at),
    sent_to_printer_at:
      row.sent_to_printer_at instanceof Date
        ? row.sent_to_printer_at.toISOString()
        : ((row.sent_to_printer_at as string | null) ?? null),
    failure_message: (row.failure_message as string | null) ?? null,
    device_label: (row.device_label as string | null) ?? null,
    location_label: (row.location_label as string | null) ?? null,
  }));
}

// Collapses the full lifecycle status model down to the visual buckets the
// dashboard cares about: successfully printed, definitively failed, a public
// demo note (never printed by design), or still in some in-between/held state
// (submitted, approved, queued, claimed, printing, expired, rejected, deleted).
type Bucket = "printed" | "failed" | "demo" | "held";

function statusBucket(status: string): Bucket {
  if (status === "sent_to_printer") return "printed";
  if (status === "failed") return "failed";
  if (status === "demo_delivered") return "demo";
  return "held";
}

function formatSubmittedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function MessageCard({ message }: { message: MessageRow }) {
  const bucket = statusBucket(message.status);
  const origin = [message.device_label, message.location_label].filter(Boolean).join(" · ");
  return (
    <li className="dash-card">
      <div className="dash-card-top">
        <span className="dash-seq">#{message.sequence_number ?? "—"}</span>
        <time className="dash-time" dateTime={message.submitted_at}>
          {formatSubmittedAt(message.submitted_at)}
        </time>
        <span className={`dash-status dash-status-${bucket}`}>{message.status}</span>
      </div>

      <div className="dash-card-meta">
        <span className="dash-recipient">To: {message.recipient ?? "—"}</span>
        <span className="dash-sender">From: {message.sender_name || "Anonymous"}</span>
        <span className="dash-theme">Theme: {message.theme ?? "—"}</span>
        {message.household ? <span className="dash-household">via {message.household}</span> : null}
      </div>

      <p className="dash-message-text">{message.message_text}</p>

      {message.status === "failed" && message.failure_message && (
        <p className="dash-failure">Failure: {message.failure_message}</p>
      )}

      {origin && <p className="dash-origin">{origin}</p>}
    </li>
  );
}

export default async function DashPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const keyParam = params.key;
  const suppliedKey = Array.isArray(keyParam) ? keyParam[0] : keyParam;

  const dashKey = process.env.DASH_KEY;

  // If DASH_KEY isn't configured, or the supplied key doesn't match, the
  // page must not reveal that a key-gated dashboard exists at all.
  if (!dashKey || !suppliedKey || suppliedKey !== dashKey) {
    notFound();
  }

  const all = await fetchMessages();
  const telegrams = all.filter((message) => message.source !== "public_demo");
  const demoNotes = all.filter((message) => message.source === "public_demo");
  const links = familyLinks();
  const root = rootChannel();

  const counts = telegrams.reduce<Record<string, number>>((acc, message) => {
    acc[message.status] = (acc[message.status] ?? 0) + 1;
    return acc;
  }, {});
  const statusEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  // Telegrams per household, among the rows loaded.
  const perHousehold = new Map<string, number>();
  for (const message of telegrams) {
    if (message.household) perHousehold.set(message.household, (perHousehold.get(message.household) ?? 0) + 1);
  }

  return (
    <main className="dash-shell">
      <header className="dash-header">
        <h1>Paper Telegram — Dashboard</h1>
        <p className="dash-summary">
          <strong>{plural(telegrams.length, "telegram")}</strong> and{" "}
          <strong>{plural(demoNotes.length, "public demo note")}</strong> shown (latest {FETCH_LIMIT} in all)
          {statusEntries.length > 0 && (
            <>
              {" — "}
              {statusEntries.map(([status, count], index) => (
                <span key={status} className={`dash-summary-pill dash-status-${statusBucket(status)}`}>
                  {status}: {count}
                  {index < statusEntries.length - 1 ? " " : ""}
                </span>
              ))}
            </>
          )}
        </p>
        <p className="dash-root" data-mode={root}>
          <strong>papertelegram.com root:</strong>{" "}
          {root === "public"
            ? "demo mode. Notes written there come to your phone and nothing prints. Only the family links print."
            : "live. It still prints for anyone. Set ROOT_MODE to demo in Vercel and redeploy once the family has their links."}
        </p>
      </header>

      <section className="dash-section" aria-labelledby="links-title">
        <h2 id="links-title">Family links</h2>
        <p className="dash-section-note">
          One private link per household. Text it to them, or let them scan the printer sticker. Telegrams
          sent through a link carry its label, so the counts below say who is using it. To retire a link,
          remove its key from FAMILY_KEYS in Vercel and redeploy; the others keep working.
        </p>
        {links.length === 0 ? (
          <p className="dash-empty">No family links are configured. Set FAMILY_KEYS in Vercel.</p>
        ) : (
          <ul className="dash-links">
            {links.map((link) => {
              const url = familyLinkUrl(link.key);
              return (
                <li key={link.key} className="dash-link">
                  <div className="dash-link-main">
                    <span className="dash-link-label">{link.label}</span>
                    <code className="dash-link-url">{url}</code>
                  </div>
                  <span className="dash-link-count">{plural(perHousehold.get(link.label) ?? 0, "telegram")}</span>
                  <CopyButton value={url} label={link.label} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dash-section" aria-labelledby="telegrams-title">
        <h2 id="telegrams-title">Telegrams</h2>
        {telegrams.length === 0 ? (
          <p className="dash-empty">No telegrams yet.</p>
        ) : (
          <ul className="dash-list">
            {telegrams.map((message) => (
              <MessageCard key={message.public_id} message={message} />
            ))}
          </ul>
        )}
      </section>

      <section className="dash-section" aria-labelledby="demo-title">
        <h2 id="demo-title">Public demo notes</h2>
        <p className="dash-section-note">
          Written on the public page, or sent straight to the API without a family link. Pushed to your
          phone, never printed.
        </p>
        {demoNotes.length === 0 ? (
          <p className="dash-empty">No demo notes yet.</p>
        ) : (
          <ul className="dash-list">
            {demoNotes.map((message) => (
              <MessageCard key={message.public_id} message={message} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
