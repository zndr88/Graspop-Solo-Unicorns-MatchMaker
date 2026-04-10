import { GrasStore } from "./store";

type Env = {
  GRAS_DO: DurableObjectNamespace;
  ADMIN_TOKEN?: string;
};

const BUILD_ID = "do-v1";

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

async function forwardToStore(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const id = env.GRAS_DO.idFromName("global");
  const stub = env.GRAS_DO.get(id);
  const forwarded = new Request(`https://store${url.pathname}${url.search}`, req);
  return stub.fetch(forwarded);
}

function isAdminRequest(url: URL) {
  return url.pathname.startsWith("/api/admin/");
}

function isAdminAuthorized(req: Request, env: Env) {
  const secret = env.ADMIN_TOKEN;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
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

    if (isAdminRequest(url)) {
      if (!isAdminAuthorized(req, env)) {
        return withCors(jsonResponse({ error: "Forbidden" }, { status: 403 }));
      }
      return withCors(await forwardToStore(req, env));
    }

    if (url.pathname === "/api/version" && req.method === "GET") {
      return ok({ ok: true, build: BUILD_ID });
    }

    return withCors(jsonResponse({ error: "Not found" }, { status: 404 }));
  }
};

export { GrasStore };
