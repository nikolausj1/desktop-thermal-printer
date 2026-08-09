const PUBLIC_API_BASE = "https://vamppbjgfpwasjcvpaho.supabase.co/functions/v1/public-api";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

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
