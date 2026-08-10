import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  submitted_at: string;
  sent_to_printer_at: string | null;
  failure_message: string | null;
  device_label: string | null;
  location_label: string | null;
};

const SELECT_FIELDS =
  "public_id,sequence_number,sender_name,message_text,recipient,theme,status,submitted_at,sent_to_printer_at,failure_message,device_label,location_label";

async function fetchMessages(): Promise<MessageRow[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Dashboard is misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const url = `${supabaseUrl}/rest/v1/messages?select=${SELECT_FIELDS}&order=submitted_at.desc&limit=200`;

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Dashboard query failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as MessageRow[];
}

// Collapses the full lifecycle status model down to the three visual
// buckets the dashboard cares about: successfully printed, definitively
// failed, or still in some in-between/held state (submitted, approved,
// queued, claimed, printing, expired, rejected, deleted).
function statusBucket(status: string): "printed" | "failed" | "held" {
  if (status === "sent_to_printer") return "printed";
  if (status === "failed") return "failed";
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

  const messages = await fetchMessages();

  const counts = messages.reduce<Record<string, number>>((acc, message) => {
    acc[message.status] = (acc[message.status] ?? 0) + 1;
    return acc;
  }, {});

  const statusEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <main className="dash-shell">
      <header className="dash-header">
        <h1>Paper Telegram — Dashboard</h1>
        <p className="dash-summary">
          <strong>{messages.length}</strong> message{messages.length === 1 ? "" : "s"} shown (latest 200)
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
      </header>

      {messages.length === 0 ? (
        <p className="dash-empty">No messages yet.</p>
      ) : (
        <ul className="dash-list">
          {messages.map((message) => {
            const bucket = statusBucket(message.status);
            const origin = [message.device_label, message.location_label].filter(Boolean).join(" · ");
            return (
              <li key={message.public_id} className="dash-card">
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
                </div>

                <p className="dash-message-text">{message.message_text}</p>

                {message.status === "failed" && message.failure_message && (
                  <p className="dash-failure">Failure: {message.failure_message}</p>
                )}

                {origin && <p className="dash-origin">{origin}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
