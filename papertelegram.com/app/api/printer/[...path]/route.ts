import { asDbError, db } from "../../../../lib/db";
import { resolveFamilyKey, rootChannel } from "../../../../lib/family-keys";
import { inferDeviceLabel, lookupApproximateLocation } from "../../../../lib/origin-metadata";
import { moderateMessage, normalizeMessage, normalizeName } from "../../../../lib/public-api-helpers";

// The site's public API: printer status, message status, and submission.
//
// Everything here runs on Vercel and calls the queue's database functions
// directly (see lib/db.ts). The gate between the private family links (which
// print) and everything else (the public demo, which sends the note to
// Justin instead) lives here: a page served from a family link sends its key
// in x-pt-key, and only a current key reaches the print queue. The database
// functions are callable only by the site's own database role, so there is
// no way around this handler.

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

type JsonRecord = Record<string, unknown>;

const PRINTER_ID = "desk-rp820";
const MAX_BODY_BYTES = 5000;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(status: number, body: JsonRecord, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...extra } });
}

function object(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Vercel sets x-real-ip to the connecting client; x-forwarded-for is the
// chain it saw, client first.
function requestIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

type ResolvedChannel = { channel: "family" | "public"; household: string };

// - A current family key means family (prints) and carries the household.
// - A key that is no longer current is refused outright rather than quietly
//   turned into a demo note, so a rotated link fails loudly for the family.
// - No key is the public root: family while ROOT_MODE is live, demo once it
//   is demo.
function resolveChannel(request: Request): ResolvedChannel | Response {
  const key = request.headers.get("x-pt-key");
  if (key) {
    const link = resolveFamilyKey(key);
    if (!link) {
      return json(403, {
        ok: false,
        code: "link_inactive",
        error: "This link is no longer active. Ask Justin for a fresh one.",
      });
    }
    return { channel: "family", household: link.label };
  }
  if (rootChannel() === "public") return { channel: "public", household: "Public site" };
  return { channel: "family", household: "papertelegram.com root" };
}

function logError(event: string, error: unknown): void {
  const detail = asDbError(error);
  console.error(JSON.stringify({ event, code: detail.code, message: detail.message.slice(0, 200) }));
}

async function printerStatus(): Promise<Response> {
  try {
    const sql = db();
    const [row] = await sql`select public.get_public_printer_status(${PRINTER_ID}) as status`;
    const status = object(row?.status);
    if (!status) throw new Error("Empty status.");
    return json(200, { ok: true, ...status });
  } catch (error) {
    logError("public_status_failed", error);
    return json(503, {
      ok: false,
      status: "offline",
      label: "Printer offline",
      message: "New messages are temporarily unavailable.",
      acceptingMessages: false,
    });
  }
}

async function messageStatus(publicId: string): Promise<Response> {
  let rows: JsonRecord[];
  try {
    const sql = db();
    rows = await sql`select * from public.get_public_message_status(${publicId})`;
  } catch (error) {
    logError("message_status_failed", error);
    return json(503, { ok: false, error: "Message status is temporarily unavailable." });
  }
  const row = rows[0];
  if (!row || row.current_status === "not_found") {
    return json(404, { ok: false, error: "Message not found." });
  }
  return json(200, {
    ok: true,
    status: row.current_status,
    label: row.label,
    message: row.public_message,
    terminal: row.terminal,
  });
}

function mapSubmissionFailure(result: JsonRecord): Response {
  const code = String(result.result_code || "invalid");
  const retryAfter = Number(result.retry_after_seconds || 0);
  const responses: Record<string, { status: number; message: string }> = {
    paused: { status: 409, message: "The printer is not accepting messages right now." },
    offline: { status: 409, message: "The printer is temporarily unavailable. Nothing was printed." },
    rate_limited: { status: 429, message: "Too many messages have been sent from this connection. Try again later." },
    daily_limit: { status: 429, message: "The printer has reached its daily message limit." },
    duplicate: { status: 429, message: "That message was already sent recently. Try again later." },
    invalid: { status: 400, message: "This message could not be accepted." },
  };
  const selected = responses[code] || responses.invalid;
  return json(selected.status, { ok: false, code, error: selected.message }, retryAfter > 0 ? { "retry-after": String(retryAfter) } : {});
}

async function submit(request: Request): Promise<Response> {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    console.error(JSON.stringify({ event: "ip_hash_salt_missing" }));
    return json(503, { ok: false, error: "The telegram service is misconfigured. Nothing was sent." });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "Request is too large." });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "Request is too large." });
  }
  let body: JsonRecord | null = null;
  try {
    body = object(JSON.parse(raw));
  } catch {
    return json(400, { ok: false, error: "Invalid request." });
  }
  // The honeypot field is filled only by bots.
  if (!body || (typeof body.website === "string" && body.website.length > 0)) {
    return json(400, { ok: false, error: "This message could not be accepted." });
  }

  const name = normalizeName(body.name);
  const message = normalizeMessage(body.message);
  const moderation = message.ok ? moderateMessage(message.value) : message;
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  // Optional first-class fields; anything unrecognized is stored as null
  // rather than rejected so older clients keep working.
  const recipient = body.recipient === "Vinny" || body.recipient === "Chase" ? body.recipient : null;
  const theme = body.theme === "airmail" || body.theme === "owl-post" ? body.theme : null;

  if (
    !name.ok ||
    !message.ok ||
    !moderation.ok ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(idempotencyKey)
  ) {
    return json(400, { ok: false, error: "This message could not be accepted." });
  }

  const resolved = resolveChannel(request);
  if (resolved instanceof Response) return resolved;

  const ipAddress = requestIp(request);
  const ipHash = `ip_${await sha256(`${salt}:${ipAddress}`)}`;
  const userAgent = request.headers.get("user-agent") || "unknown";
  const language = request.headers.get("accept-language") || "unknown";
  const senderFingerprint = `fp_${await sha256(`${ipHash}:${userAgent}:${language}`)}`;
  const contentHash = `content_${await sha256(message.value.toLocaleLowerCase("en-US"))}`;
  const userAgentSummary = `ua_${await sha256(userAgent)}`;
  const deviceLabel = inferDeviceLabel(
    userAgent,
    request.headers.get("sec-ch-ua-platform"),
    request.headers.get("sec-ch-ua-mobile"),
  );
  const location = await lookupApproximateLocation(ipAddress);

  const senderName = name.value || null;
  const messageText = message.value;
  const locationCity = location?.city || null;
  const locationRegion = location?.region || null;
  const locationCountry = location?.country || null;
  const locationCountryCode = location?.countryCode || null;
  const locationLabel = location?.label || null;
  const household = resolved.household;

  if (resolved.channel === "public") {
    let rows: JsonRecord[];
    try {
      const sql = db();
      rows = await sql`
        select * from public.submit_demo_message(
          p_sender_name => ${senderName},
          p_message_text => ${messageText},
          p_client_idempotency_key => ${idempotencyKey}::uuid,
          p_ip_hash => ${ipHash},
          p_sender_fingerprint => ${senderFingerprint},
          p_content_hash => ${contentHash},
          p_user_agent_summary => ${userAgentSummary},
          p_device_label => ${deviceLabel},
          p_location_city => ${locationCity},
          p_location_region => ${locationRegion},
          p_location_country => ${locationCountry},
          p_location_country_code => ${locationCountryCode},
          p_location_label => ${locationLabel},
          p_recipient => ${recipient},
          p_theme => ${theme},
          p_household => ${household}
        )`;
    } catch (error) {
      logError("demo_submission_failed", error);
      return json(503, { ok: false, error: "Your note could not be sent. Please try again." });
    }
    const row = rows[0];
    if (!row || row.result_code !== "ok") return mapSubmissionFailure(row || { result_code: "invalid" });
    return json(202, {
      ok: true,
      demo: true,
      terminal: true,
      messageId: row.result_public_id,
      status: row.result_status,
      statusPath: `/messages/${row.result_public_id}`,
    });
  }

  // "hold" parks every telegram for review instead of printing it.
  const holdForReview = (process.env.PUBLIC_API_MODE || "live") !== "live";
  let rows: JsonRecord[];
  try {
    const sql = db();
    rows = await sql`
      select * from public.submit_public_message_v4(
        p_printer_id => ${PRINTER_ID},
        p_sender_name => ${senderName},
        p_message_text => ${messageText},
        p_client_idempotency_key => ${idempotencyKey}::uuid,
        p_ip_hash => ${ipHash},
        p_sender_fingerprint => ${senderFingerprint},
        p_content_hash => ${contentHash},
        p_user_agent_summary => ${userAgentSummary},
        p_device_label => ${deviceLabel},
        p_location_city => ${locationCity},
        p_location_region => ${locationRegion},
        p_location_country => ${locationCountry},
        p_location_country_code => ${locationCountryCode},
        p_location_label => ${locationLabel},
        p_hold_for_review => ${holdForReview},
        p_recipient => ${recipient},
        p_theme => ${theme},
        p_household => ${household}
      )`;
  } catch (error) {
    logError("public_submission_failed", error);
    return json(503, { ok: false, error: "Your message could not be sent. Please try again." });
  }
  const row = rows[0];
  if (!row || row.result_code !== "ok") return mapSubmissionFailure(row || { result_code: "invalid" });
  return json(202, {
    ok: true,
    messageId: row.result_public_id,
    status: row.result_status,
    statusPath: `/messages/${row.result_public_id}`,
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { path } = await context.params;
  const route = path.join("/");
  if (route === "status") return printerStatus();
  const match = route.match(/^messages\/(msg_[a-f0-9]{32})$/u);
  if (match?.[1]) return messageStatus(match[1]);
  return json(404, { ok: false, error: "Not found." });
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  if (path.join("/") === "messages") return submit(request);
  return json(404, { ok: false, error: "Not found." });
}
