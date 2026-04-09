type StoredUser = {
  id: string;
  tokenHash: string;
  nickname: string;
  selectedBands: string[];
  updatedAt: string;
};

type Match = {
  key: string;
  nickname: string;
  matchPct: number;
  sharedCount: number;
  sharedBands: string[];
};

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

function badRequest(message: string) {
  return jsonResponse({ error: message }, { status: 400 });
}

function forbidden() {
  return jsonResponse({ error: "Forbidden" }, { status: 403 });
}

function ok(body: unknown = { ok: true }) {
  const payload =
    typeof body === "object" && body !== null
      ? { store: "do", ...(body as Record<string, unknown>) }
      : { store: "do", ok: true, value: body };
  return jsonResponse(payload, { status: 200 });
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

function sanitizeToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const token = raw.trim();
  if (token.length < 16 || token.length > 120) return null;
  return token;
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

const USER_PREFIX = "user:";

export class GrasStore implements DurableObject {
  private state: DurableObjectState;
  private startedAt: number;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.startedAt = Date.now();
  }

  private userKey(id: string) {
    return `${USER_PREFIX}${id}`;
  }

  private async loadUser(id: string): Promise<StoredUser | null> {
    const raw = await this.state.storage.get<string>(this.userKey(id));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredUser;
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.id !== "string") return null;
      if (typeof parsed.tokenHash !== "string") return null;
      if (typeof parsed.nickname !== "string") return null;
      if (!Array.isArray(parsed.selectedBands)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/api/me" && req.method === "PUT") {
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

      const token = sanitizeToken(anyBody.token);
      if (!token) return badRequest("Invalid token");

      const nickname = sanitizeNickname(anyBody.nickname);
      if (!nickname) return badRequest("Invalid nickname (2–24 chars)");

      const selectedBands = sanitizeSelectedBands(anyBody.selectedBands);
      if (!selectedBands) return badRequest("Invalid selectedBands");

      const existing = await this.loadUser(id);
      const tokenHash = await sha256Hex(token);
      if (existing && existing.tokenHash !== tokenHash) return forbidden();

      const profile: StoredUser = {
        id,
        tokenHash,
        nickname,
        selectedBands,
        updatedAt: new Date().toISOString()
      };

      await this.state.storage.put(this.userKey(id), JSON.stringify(profile));
      return ok({ ok: true });
    }

    if (url.pathname === "/api/me" && req.method === "DELETE") {
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

      const token = sanitizeToken(anyBody.token);
      if (!token) return badRequest("Invalid token");

      const existing = await this.loadUser(id);
      if (!existing) return ok({ ok: true });

      const tokenHash = await sha256Hex(token);
      if (existing.tokenHash !== tokenHash) return forbidden();

      await this.state.storage.delete(this.userKey(id));
      return ok({ ok: true });
    }

    if (url.pathname === "/api/matches" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id || id.length < 8 || id.length > 80) return badRequest("Missing id");

      const me = await this.loadUser(id);
      if (!me) return ok({ matches: [] });

      const list = await this.state.storage.list<string>({ prefix: USER_PREFIX });
      const matches: Match[] = [];

      for (const [key, raw] of list.entries()) {
        const otherId = key.slice(USER_PREFIX.length);
        if (!otherId || otherId === id) continue;
        let other: StoredUser | null = null;
        try {
          other = JSON.parse(raw) as StoredUser;
        } catch {
          other = null;
        }
        if (!other || typeof other.nickname !== "string" || !Array.isArray(other.selectedBands)) continue;

        const sim = jaccard(me.selectedBands, other.selectedBands);
        if (sim.sharedCount <= 0) continue;
        matches.push({
          key: (await sha256Hex(other.id)).slice(0, 16),
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

    if (url.pathname === "/api/store-health" && req.method === "GET") {
      return ok({ ok: true, startedAt: new Date(this.startedAt).toISOString() });
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  }
}
