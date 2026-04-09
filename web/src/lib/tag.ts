function hex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function tagFromId(id: string, length = 4): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
    return hex(digest).slice(0, length).toUpperCase();
  } catch {
    return id.replace(/-/g, "").slice(-length).toUpperCase();
  }
}

