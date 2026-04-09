import type { Match, UserProfile } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE?.toString().replace(/\/$/, "") || "";

function url(path: string) {
  if (!API_BASE) return path;
  return `${API_BASE}${path}`;
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function upsertMe(profile: UserProfile): Promise<{ ok: true }> {
  return requestJson(url("/api/me"), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profile)
  });
}

export async function getMatches(id: string): Promise<{ matches: Match[] }> {
  const q = new URLSearchParams({ id });
  return requestJson(url(`/api/matches?${q.toString()}`), { method: "GET" });
}

export async function deleteMe(id: string): Promise<{ ok: true }> {
  const q = new URLSearchParams({ id });
  return requestJson(url(`/api/me?${q.toString()}`), { method: "DELETE" });
}
