const UUID_KEY = "gras_uuid";
const NICKNAME_KEY = "gras_nickname";
const SELECTED_KEY = "gras_selectedBands";
const TOKEN_KEY = "gras_token";

export function getOrCreateUuid(): string {
  const existing = localStorage.getItem(UUID_KEY);
  if (existing && existing.length > 8) return existing;

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `uuid-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
  localStorage.setItem(UUID_KEY, id);
  return id;
}

export function getNickname(): string | null {
  const raw = localStorage.getItem(NICKNAME_KEY);
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

export function setNickname(nickname: string) {
  localStorage.setItem(NICKNAME_KEY, nickname.trim());
}

export function getOrCreateToken(): string {
  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing && existing.length >= 16) return existing;

  const token =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `tok-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

export function getSelectedBands(): string[] {
  const raw = localStorage.getItem(SELECTED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function setSelectedBands(bandIds: string[]) {
  localStorage.setItem(SELECTED_KEY, JSON.stringify(bandIds));
}

export function clearLocalIdentity() {
  localStorage.removeItem(UUID_KEY);
  localStorage.removeItem(NICKNAME_KEY);
  localStorage.removeItem(SELECTED_KEY);
  localStorage.removeItem(TOKEN_KEY);
}
