# gras-worker

Cloudflare Worker backend for the Graspop Matchmaker MVP.

## Endpoints

- `GET /api/health`
- `PUT /api/me` `{ id, nickname, selectedBands[] }`
- `DELETE /api/me?id=<uuid>`
- `GET /api/matches?id=<uuid>`

## Local dev

1. `npm install`
2. Create KV namespace:
   - `npx wrangler kv:namespace create GRAS_KV`
3. Put the returned id into `wrangler.toml`
4. `npm run dev`

## Notes

- Uses KV TTL to auto-expire user records (default ~21 days).
- Designed for small groups (KV `list()` + per-key `get()` is fine at WhatsApp-group scale).

