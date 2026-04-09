# Graspop Matchmaker (MVP)

Mobile-first web app to help solo Graspop adventurers find others with similar band preferences — no accounts, no email, just a nickname + selected bands.

## What’s in here

- `web/`: React + Vite frontend (static hosting friendly)
- `worker/`: Cloudflare Worker (KV-backed) tiny backend for shared matching

## Data + privacy

- Stored per user: anonymous UUID, nickname, selected band ids, `updatedAt`
- No real accounts, email, phone number, or passwords
- Profiles are not auto-deleted before the festival; after the festival, inactive profiles are pruned automatically (configurable in `worker/src/store.ts`)

## Quick start (local dev)

### 1) Backend (Cloudflare Worker)

1. `cd worker`
2. `npm install`
3. Create a KV namespace (one-time):
   - `npx wrangler kv:namespace create GRAS_KV`
4. Copy the returned id into `worker/wrangler.toml` (`kv_namespaces[0].id`)
5. Run:
   - `npm run dev`

This prints a local URL like `http://127.0.0.1:8787`.

### 2) Frontend (Vite)

1. `cd web`
2. `npm install`
3. Run:
   - `npm run dev`

By default, Vite dev proxies `/api/*` to `http://127.0.0.1:8787` (so you don’t need any env var locally).

If your backend lives elsewhere, set `VITE_API_BASE` (see `web/.env.example`).

## Deploy (simple + cheap)

- Frontend: GitHub Pages or Cloudflare Pages
- Backend: Cloudflare Worker (free tier usually fine for small WhatsApp groups)

### Deploy worker

- `cd worker`
- `npm run deploy`

### Deploy frontend

- `cd web`
- `npm run build` → deploy `web/dist/`

If you deploy the frontend on GitHub Pages (different origin), set `VITE_API_BASE` at build time to your worker URL (e.g. `https://<name>.<account>.workers.dev`).

## Lineup data

Edit `web/src/data/lineup.json` to match the real lineup:

- Keys: day names (e.g. `"Thursday"`)
- Values: array of `{ "id": "unique-id", "name": "Band Name" }`
