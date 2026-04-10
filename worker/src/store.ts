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

function toKey(id: string) {
  // Short, non-reversible identifier for UI/admin purposes.
  // Keep consistent with matches key format.
  return sha256Hex(id).then((h) => h.slice(0, 16));
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
      shared.push(x);
    }
  }
  const union = setA.size + setB.size - intersection;
  const matchPct = union === 0 ? 0 : (intersection / union) * 100;
  return { matchPct, sharedCount: intersection, sharedBands: shared };
}

const USER_PREFIX = "user:";
// Auto-prune policy:
// - Do not delete anyone before the festival.
// - After the festival, prune inactive profiles after N days.
//
// Adjust these constants as needed.
const PRUNE_NOT_BEFORE_ISO = "2026-06-22T00:00:00Z";
const PRUNE_INACTIVE_DAYS_AFTER_FESTIVAL = 45;
const PRUNE_NOT_BEFORE_MS = Date.parse(PRUNE_NOT_BEFORE_ISO);
const PRUNE_INACTIVE_MS = PRUNE_INACTIVE_DAYS_AFTER_FESTIVAL * 24 * 60 * 60 * 1000;

// In-memory rate limiting (per Durable Object instance).
// This avoids burning Workers KV operations on every request.
const RL_WINDOW_MS = 60_000;
const RL_MATCHES_PER_MIN = 30;
const RL_WRITES_PER_MIN = 60;
const RL_OTHER_PER_MIN = 120;

export class GrasStore implements DurableObject {
  private state: DurableObjectState;
  private startedAt: number;
  private rate: Map<string, number>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.startedAt = Date.now();
    this.rate = new Map();
  }

  private userKey(id: string) {
    return `${USER_PREFIX}${id}`;
  }

  private isExpired(updatedAt: string) {
    if (Number.isFinite(PRUNE_NOT_BEFORE_MS) && Date.now() < PRUNE_NOT_BEFORE_MS) return false;
    const t = Date.parse(updatedAt);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t > PRUNE_INACTIVE_MS;
  }

  private getClientIp(req: Request): string {
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("true-client-ip") ??
      req.headers.get("x-real-ip");
    if (ip && ip.length <= 128) return ip;
    const xff = req.headers.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first && first.length <= 128) return first;
    return "unknown";
  }

  private tooMany() {
    return jsonResponse({ store: "do", error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }

  private rateLimit(req: Request, bucket: "matches" | "write" | "other"): Response | null {
    const ip = this.getClientIp(req);
    const windowKey = Math.floor(Date.now() / RL_WINDOW_MS);
    const key = `${bucket}:${ip}:${windowKey}`;
    const current = this.rate.get(key) ?? 0;
    const next = current + 1;
    this.rate.set(key, next);

    // Opportunistic cleanup: clear map if it grows too large.
    if (this.rate.size > 5000) this.rate.clear();

    const limit =
      bucket === "matches" ? RL_MATCHES_PER_MIN : bucket === "write" ? RL_WRITES_PER_MIN : RL_OTHER_PER_MIN;
    if (next > limit) return this.tooMany();
    return null;
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
      if (typeof parsed.updatedAt !== "string") return null;
      if (this.isExpired(parsed.updatedAt)) {
        await this.state.storage.delete(this.userKey(id));
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      const bucket =
        url.pathname === "/api/matches"
          ? ("matches" as const)
          : url.pathname === "/api/me" && (req.method === "PUT" || req.method === "DELETE")
            ? ("write" as const)
            : ("other" as const);
      const blocked = this.rateLimit(req, bucket);
      if (blocked) return blocked;
    }

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
        if (
          !other ||
          typeof other.nickname !== "string" ||
          !Array.isArray(other.selectedBands) ||
          typeof other.updatedAt !== "string"
        ) {
          continue;
        }
        if (this.isExpired(other.updatedAt)) {
          await this.state.storage.delete(this.userKey(otherId));
          continue;
        }

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

    if (url.pathname === "/api/admin/search" && req.method === "GET") {
      const q = (url.searchParams.get("nickname") ?? "").trim().toLowerCase();
      if (q.length < 2) return badRequest("nickname query too short");

      const list = await this.state.storage.list<string>({ prefix: USER_PREFIX });
      const results: Array<{ key: string; nickname: string; updatedAt: string; selectedCount: number }> = [];

      for (const [key, raw] of list.entries()) {
        const otherId = key.slice(USER_PREFIX.length);
        if (!otherId) continue;
        let other: StoredUser | null = null;
        try {
          other = JSON.parse(raw) as StoredUser;
        } catch {
          other = null;
        }
        if (!other || typeof other.nickname !== "string" || typeof other.updatedAt !== "string") continue;
        if (this.isExpired(other.updatedAt)) {
          await this.state.storage.delete(this.userKey(otherId));
          continue;
        }
        if (!other.nickname.toLowerCase().includes(q)) continue;
        results.push({
          key: (await sha256Hex(other.id)).slice(0, 16),
          nickname: other.nickname,
          updatedAt: other.updatedAt,
          selectedCount: Array.isArray(other.selectedBands) ? other.selectedBands.length : 0
        });
        if (results.length >= 50) break;
      }

      return ok({ results });
    }

    if (url.pathname === "/api/admin/delete" && req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return badRequest("Invalid JSON");
      }
      if (typeof body !== "object" || body === null) return badRequest("Invalid body");
      const anyBody = body as Record<string, unknown>;
      const targetKey = typeof anyBody.key === "string" ? anyBody.key.trim().toLowerCase() : "";
      if (targetKey.length < 8) return badRequest("Missing key");

      const list = await this.state.storage.list<string>({ prefix: USER_PREFIX });
      for (const [key, raw] of list.entries()) {
        const otherId = key.slice(USER_PREFIX.length);
        if (!otherId) continue;
        let other: StoredUser | null = null;
        try {
          other = JSON.parse(raw) as StoredUser;
        } catch {
          other = null;
        }
        if (!other || typeof other.id !== "string") continue;
        const k = (await sha256Hex(other.id)).slice(0, 16).toLowerCase();
        if (k !== targetKey) continue;
        await this.state.storage.delete(this.userKey(otherId));
        return ok({ ok: true });
      }
      return ok({ ok: true });
    }

    if (url.pathname === "/api/store-health" && req.method === "GET") {
      return ok({ ok: true, startedAt: new Date(this.startedAt).toISOString() });
    }

    return jsonResponse({ error: "Not found" }, { status: 404 });
  }
}
