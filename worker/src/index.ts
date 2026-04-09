type UserProfile = {
  id: string;
  nickname: string;
  selectedBands: string[];
  updatedAt: string;
};

type Match = {
  id: string;
  nickname: string;
  matchPct: number;
  sharedCount: number;
  sharedBands: string[];
};

type Env = {
  GRAS_KV: KVNamespace;
};

const USER_PREFIX = "user:";
const USER_TTL_SECONDS = 60 * 60 * 24 * 21; // 21 days (auto-expires via KV TTL)

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
  return withCors(jsonResponse(body, { status: 200 }));
}

function okHtml(html: string) {
  const res = htmlResponse(html, { status: 200, headers: corsHeaders() });
  return withCors(res);
}

function getIdFromQuery(url: URL): string | null {
  const id = url.searchParams.get("id");
  if (!id) return null;
  if (id.length < 8 || id.length > 80) return null;
  return id;
}

function sanitizeNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const nickname = raw.trim();
  if (nickname.length < 2 || nickname.length > 24) return null;
  return nickname;
}

function sanitizeSelectedBands(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id) continue;
    if (id.length > 80) continue;
    out.push(id);
    if (out.length > 600) break;
  }
  return Array.from(new Set(out));
}

function jaccard(a: string[], b: string[]) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return { matchPct: 0, sharedCount: 0, sharedBands: [] as string[] };

  let intersection = 0;
  const shared: string[] = [];
  for (const x of setA) {
    if (setB.has(x)) {
      intersection += 1;
      if (shared.length < 5) shared.push(x);
    }
  }
  const union = setA.size + setB.size - intersection;
  const matchPct = union === 0 ? 0 : (intersection / union) * 100;
  return { matchPct, sharedCount: intersection, sharedBands: shared };
}

async function handleUpsertMe(req: Request, env: Env) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  if (typeof body !== "object" || body === null) return badRequest("Invalid body");
  const anyBody = body as Record<string, unknown>;

  const id = typeof anyBody.id === "string" ? anyBody.id : null;
  if (!id || id.length < 8 || id.length > 80) return badRequest("Invalid id");

  const nickname = sanitizeNickname(anyBody.nickname);
  if (!nickname) return badRequest("Invalid nickname (2–24 chars)");

  const selectedBands = sanitizeSelectedBands(anyBody.selectedBands);
  if (!selectedBands) return badRequest("Invalid selectedBands");

  const profile: UserProfile = {
    id,
    nickname,
    selectedBands,
    updatedAt: new Date().toISOString()
  };

  await env.GRAS_KV.put(`${USER_PREFIX}${id}`, JSON.stringify(profile), { expirationTtl: USER_TTL_SECONDS });
  return ok({ ok: true });
}

async function loadUser(env: Env, id: string): Promise<UserProfile | null> {
  const raw = await env.GRAS_KV.get(`${USER_PREFIX}${id}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as UserProfile;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.id !== "string") return null;
    if (typeof parsed.nickname !== "string") return null;
    if (!Array.isArray(parsed.selectedBands)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function handleMatches(url: URL, env: Env) {
  const id = getIdFromQuery(url);
  if (!id) return badRequest("Missing id");

  const me = await loadUser(env, id);
  if (!me) return ok({ matches: [] });

  const list = await env.GRAS_KV.list({ prefix: USER_PREFIX });
  const matches: Match[] = [];

  for (const key of list.keys) {
    const otherId = key.name.slice(USER_PREFIX.length);
    if (!otherId || otherId === id) continue;
    const other = await loadUser(env, otherId);
    if (!other) continue;

    const sim = jaccard(me.selectedBands, other.selectedBands);
    if (sim.sharedCount <= 0) continue;
    matches.push({
      id: other.id,
      nickname: other.nickname,
      matchPct: sim.matchPct,
      sharedCount: sim.sharedCount,
      sharedBands: sim.sharedBands
    });
  }

  matches.sort((a, b) => {
    if (b.matchPct !== a.matchPct) return b.matchPct - a.matchPct;
    if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
    return a.nickname.localeCompare(b.nickname);
  });

  return ok({ matches });
}

async function handleDeleteMe(url: URL, env: Env) {
  const id = getIdFromQuery(url);
  if (!id) return badRequest("Missing id");
  await env.GRAS_KV.delete(`${USER_PREFIX}${id}`);
  return ok({ ok: true });
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
      return handleUpsertMe(req, env);
    }

    if (url.pathname === "/api/me" && req.method === "DELETE") {
      return handleDeleteMe(url, env);
    }

    if (url.pathname === "/api/matches" && req.method === "GET") {
      return handleMatches(url, env);
    }

    return withCors(jsonResponse({ error: "Not found" }, { status: 404 }));
  }
};
