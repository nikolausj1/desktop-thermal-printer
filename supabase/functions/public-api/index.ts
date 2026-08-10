import { createClient } from "npm:@supabase/supabase-js@2";
import {
  moderateMessage,
  normalizeMessage,
  normalizeName,
} from "../_shared/public-api-helpers.ts";
import {
  inferDeviceLabel,
  lookupApproximateLocation,
} from "../_shared/origin-metadata.ts";

type JsonRecord = Record<string, unknown>;

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ipHashSalt = Deno.env.get("IP_HASH_SALT");
const publicApiMode = Deno.env.get("PUBLIC_API_MODE") || "hold";

if (!supabaseUrl || !serviceRoleKey || !ipHashSalt) {
  throw new Error("Public API is missing required server configuration.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const productionOrigins = new Set([
  "https://www.justinnikolaus.com",
  "https://justinnikolaus.com",
]);

function allowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (productionOrigins.has(origin)) return true;
  return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function responseHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
  if (origin && allowedOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
    headers.vary = "Origin";
  }
  return headers;
}

function json(request: Request, status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request.headers.get("origin")),
  });
}

function object(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function routePath(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const marker = "/public-api";
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0) return "/";
  return pathname.slice(markerIndex + marker.length) || "/";
}

function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip") ||
    forwarded ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function mapSubmissionFailure(request: Request, result: JsonRecord): Response {
  const code = String(result.result_code || "invalid");
  const retryAfter = Number(result.retry_after_seconds || 0);
  const headers = responseHeaders(request.headers.get("origin")) as Record<string, string>;
  if (retryAfter > 0) headers["retry-after"] = String(retryAfter);

  const responses: Record<string, { status: number; message: string }> = {
    paused: { status: 409, message: "The printer is not accepting messages right now." },
    offline: { status: 409, message: "The printer is temporarily unavailable. Nothing was printed." },
    rate_limited: { status: 429, message: "Too many messages have been sent from this connection. Try again later." },
    daily_limit: { status: 429, message: "The printer has reached its daily message limit." },
    duplicate: { status: 429, message: "That message was already sent recently. Try again later." },
    invalid: { status: 400, message: "This message could not be accepted." },
  };
  const selected = responses[code] || responses.invalid;
  return new Response(JSON.stringify({ ok: false, code, error: selected.message }), {
    status: selected.status,
    headers,
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (!allowedOrigin(origin)) {
    return json(request, 403, { ok: false, error: "Origin not allowed." });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }

  const path = routePath(request);

  if (request.method === "GET" && path === "/status") {
    const { data, error } = await supabase.rpc("get_public_printer_status", {
      p_printer_id: "desk-rp820",
    });
    if (error) {
      console.error(JSON.stringify({ event: "public_status_failed", code: error.code }));
      return json(request, 503, {
        ok: false,
        status: "offline",
        label: "Printer offline",
        message: "New messages are temporarily unavailable.",
        acceptingMessages: false,
      });
    }
    return json(request, 200, { ok: true, ...(data as JsonRecord) });
  }

  const statusMatch = path.match(/^\/messages\/(msg_[a-f0-9]{32})$/u);
  if (request.method === "GET" && statusMatch?.[1]) {
    const { data, error } = await supabase.rpc("get_public_message_status", {
      p_public_id: statusMatch[1],
    });
    if (error) {
      console.error(JSON.stringify({ event: "message_status_failed", code: error.code }));
      return json(request, 503, { ok: false, error: "Message status is temporarily unavailable." });
    }
    const row = Array.isArray(data) ? data[0] : null;
    if (!row || row.current_status === "not_found") {
      return json(request, 404, { ok: false, error: "Message not found." });
    }
    return json(request, 200, {
      ok: true,
      status: row.current_status,
      label: row.label,
      message: row.public_message,
      terminal: row.terminal,
    });
  }

  if (request.method === "POST" && path === "/messages") {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 5000) {
      return json(request, 413, { ok: false, error: "Request is too large." });
    }

    let body: JsonRecord | null = null;
    try {
      body = object(await request.json());
    } catch {
      return json(request, 400, { ok: false, error: "Invalid request." });
    }
    if (!body || (typeof body.website === "string" && body.website.length > 0)) {
      return json(request, 400, { ok: false, error: "This message could not be accepted." });
    }

    const name = normalizeName(body.name);
    const message = normalizeMessage(body.message);
    const moderation = message.ok ? moderateMessage(message.value) : message;
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
    // Optional first-class fields; anything unrecognized is stored as null
    // rather than rejected so older clients keep working.
    const recipient =
      body.recipient === "Vinny" || body.recipient === "Chase" ? body.recipient : null;
    const theme = body.theme === "airmail" || body.theme === "owl-post" ? body.theme : null;

    if (
      !name.ok ||
      !message.ok ||
      !moderation.ok ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(idempotencyKey)
    ) {
      return json(request, 400, { ok: false, error: "This message could not be accepted." });
    }

    const ipAddress = requestIp(request);
    const ipHash = `ip_${await sha256(`${ipHashSalt}:${ipAddress}`)}`;
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

    const { data, error } = await supabase.rpc("submit_public_message_v3", {
      p_printer_id: "desk-rp820",
      p_sender_name: name.value || null,
      p_message_text: message.value,
      p_client_idempotency_key: idempotencyKey,
      p_ip_hash: ipHash,
      p_sender_fingerprint: senderFingerprint,
      p_content_hash: contentHash,
      p_user_agent_summary: userAgentSummary,
      p_device_label: deviceLabel,
      p_location_city: location?.city || null,
      p_location_region: location?.region || null,
      p_location_country: location?.country || null,
      p_location_country_code: location?.countryCode || null,
      p_location_label: location?.label || null,
      p_hold_for_review: publicApiMode !== "live",
      p_recipient: recipient,
      p_theme: theme,
    });

    if (error) {
      console.error(JSON.stringify({ event: "public_submission_failed", code: error.code }));
      return json(request, 503, { ok: false, error: "Your message could not be sent. Please try again." });
    }

    const row = Array.isArray(data) ? (data[0] as JsonRecord | undefined) : undefined;
    if (!row || row.result_code !== "ok") {
      return mapSubmissionFailure(request, row || { result_code: "invalid" });
    }

    return json(request, 202, {
      ok: true,
      messageId: row.result_public_id,
      status: row.result_status,
      statusPath: `/messages/${row.result_public_id}`,
    });
  }

  return json(request, 404, { ok: false, error: "Not found." });
});
