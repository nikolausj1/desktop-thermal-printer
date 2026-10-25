import { resolveFamilyKey, rootChannel } from "../../../../lib/family-keys";

const PUBLIC_API_BASE = "https://vamppbjgfpwasjcvpaho.supabase.co/functions/v1/public-api";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

type ResolvedChannel = { channel: "family" | "public"; household: string };

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

// Which channel is this browser on? Only the edge function can enforce the
// answer (its URL is public), so the proxy tells it with two headers: a shared
// PROXY_KEY secret proving the request came through here, and the channel.
//
// - A page served from a private family link sends its key in x-pt-key. A
//   current key means family (prints) and carries the household label. A key
//   that is no longer current is refused outright rather than quietly turned
//   into a demo note, so a rotated link fails loudly for the family member.
// - No key is the public root. While ROOT_MODE is live that still prints,
//   as it always has; once it is demo, it is the public demo.
function resolveChannel(request: Request): ResolvedChannel | Response {
  const key = request.headers.get("x-pt-key");
  if (key) {
    const link = resolveFamilyKey(key);
    if (!link) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "link_inactive",
          error: "This link is no longer active. Ask Justin for a fresh one.",
        }),
        { status: 403, headers: jsonHeaders },
      );
    }
    return { channel: "family", household: link.label };
  }
  if (rootChannel() === "public") return { channel: "public", household: "Public site" };
  return { channel: "family", household: "papertelegram.com root" };
}

async function proxyRequest(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const target = `${PUBLIC_API_BASE}/${path.map(encodeURIComponent).join("/")}`;
  const headers = new Headers({ accept: "application/json" });

  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  for (const name of ["user-agent", "accept-language", "sec-ch-ua-platform", "sec-ch-ua-mobile"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  const resolved = resolveChannel(request);
  if (resolved instanceof Response) return resolved;
  headers.set("x-pt-channel", resolved.channel);
  headers.set("x-pt-household", resolved.household);
  const proxyKey = process.env.PROXY_KEY;
  if (proxyKey) headers.set("x-pt-proxy-key", proxyKey);

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "POST" ? await request.text() : undefined,
    cache: "no-store",
  });

  const responseHeaders = new Headers({
    "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) responseHeaders.set("retry-after", retryAfter);

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxyRequest(request, context);
}
