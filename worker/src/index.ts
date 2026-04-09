import { GrasStore } from "./store";

type Env = {
  GRAS_KV: KVNamespace;
  GRAS_DO: DurableObjectNamespace;
};

const BUILD_ID = "do-v1";

const RL_PREFIX = "rl:";
const RL_WINDOW_SECONDS = 60;
const RL_LIMIT_MATCHES_PER_MIN = 30;
const RL_LIMIT_WRITES_PER_MIN = 60;
const RL_LIMIT_OTHER_PER_MIN = 120;

function hex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return hex(digest);
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function htmlResponse(html: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(html, { ...init, headers });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

function withCors(res: Response) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function badRequest(message: string) {
  return withCors(jsonResponse({ error: message }, { status: 400 }));
}

function tooManyRequests(message: string) {
  return withCors(
    jsonResponse(
      { error: message },
      { status: 429, headers: { "retry-after": String(RL_WINDOW_SECONDS) } }
    )
  );
}

function ok(body: unknown = { ok: true }) {
  return withCors(jsonResponse({ build: BUILD_ID, ...((body as object) ?? {}) }, { status: 200 }));
}

function okHtml(html: string) {
  return withCors(htmlResponse(html, { status: 200 }));
}

function getIdFromQuery(url: URL): string | null {
  const id = url.searchParams.get("id");
  if (!id) return null;
  if (id.length < 8 || id.length > 80) return null;
  return id;
}

function getClientIp(req: Request): string | null {
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("true-client-ip") ??
    req.headers.get("x-real-ip");
  if (ip && ip.length <= 128) return ip;

  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  if (first && first.length <= 128) return first;
  return null;
}

async function rateLimit(req: Request, env: Env, bucket: string, limit: number): Promise<Response | null> {
  const ip = getClientIp(req) ?? "unknown";
  const windowKey = Math.floor(Date.now() / (RL_WINDOW_SECONDS * 1000));
  const key = `${RL_PREFIX}${bucket}:${ip}:${windowKey}`;

  const raw = await env.GRAS_KV.get(key);
  const current = raw ? Number.parseInt(raw, 10) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;

  // Best-effort fixed-window rate limiting; acceptable for small-group scale.
  await env.GRAS_KV.put(key, String(next), { expirationTtl: RL_WINDOW_SECONDS + 10 });

  if (next > limit) return tooManyRequests("Rate limit exceeded. Try again in a minute.");
  return null;
}

async function forwardToStore(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const id = env.GRAS_DO.idFromName("global");
  const stub = env.GRAS_DO.get(id);
  const forwarded = new Request(`https://store${url.pathname}${url.search}`, req);
  return stub.fetch(forwarded);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    // Rate limit everything except the root + health endpoints.
    // Uses short-lived KV counters keyed by (bucket + IP + minute window).
    if (url.pathname !== "/" && url.pathname !== "/api/health") {
      const isMatches = url.pathname === "/api/matches" && req.method === "GET";
      const isWrite = url.pathname === "/api/me" && (req.method === "PUT" || req.method === "DELETE");

      const bucket = isMatches ? "matches" : isWrite ? "write" : "other";
      const limit = isMatches
        ? RL_LIMIT_MATCHES_PER_MIN
        : isWrite
          ? RL_LIMIT_WRITES_PER_MIN
          : RL_LIMIT_OTHER_PER_MIN;

      const blocked = await rateLimit(req, env, bucket, limit);
      if (blocked) return blocked;
    }

    if (url.pathname === "/" && req.method === "GET") {
      return okHtml(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Graspop Matchmaker API</title>
    <style>
      :root{color-scheme:dark}
      body{margin:0;font:14px/1.45 ui-sans-serif,system-ui,Segoe UI,Roboto,Arial;background:#0b0f16;color:rgba(255,255,255,.92)}
      main{max-width:720px;margin:0 auto;padding:24px}
      a{color:#6ee7ff}
      code{background:rgba(255,255,255,.06);padding:.15rem .35rem;border-radius:.4rem}
      .card{border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:14px 16px;background:rgba(255,255,255,.04)}
    </style>
  </head>
  <body>
    <main>
      <h1 style="margin:0 0 10px;font-size:18px">Graspop Matchmaker API</h1>
      <div class="card">
        <div>Health check: <a href="/api/health"><code>/api/health</code></a></div>
        <div style="margin-top:8px;color:rgba(255,255,255,.66)">This Worker serves JSON endpoints under <code>/api/*</code> for the Graspop Matchmaker web app.</div>
      </div>
    </main>
  </body>
</html>`);
    }

    if (url.pathname === "/api/health") {
      return ok({ ok: true, ts: new Date().toISOString() });
    }

    if (url.pathname === "/api/me" && req.method === "PUT") {
      return withCors(await forwardToStore(req, env));
    }

    if (url.pathname === "/api/me" && req.method === "DELETE") {
      return withCors(await forwardToStore(req, env));
    }

    if (url.pathname === "/api/matches" && req.method === "GET") {
      return withCors(await forwardToStore(req, env));
    }

    if (url.pathname === "/api/store-health" && req.method === "GET") {
      return withCors(await forwardToStore(req, env));
    }

    if (url.pathname === "/api/version" && req.method === "GET") {
      return ok({ ok: true, build: BUILD_ID });
    }

    return withCors(jsonResponse({ error: "Not found" }, { status: 404 }));
  }
};

export { GrasStore };
