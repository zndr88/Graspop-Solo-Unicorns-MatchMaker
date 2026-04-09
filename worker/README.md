# gras-worker

Cloudflare Worker backend for the Graspop Matchmaker MVP.

## Endpoints

- `GET /api/health`
- `PUT /api/me` `{ id, token, nickname, selectedBands[] }`
- `DELETE /api/me` `{ id, token }`
- `GET /api/matches?id=<uuid>`

## Local dev

1. `npm install`
2. Create KV namespace:
   - `npx wrangler kv namespace create GRAS_KV`
3. Put the returned id into `wrangler.toml`
4. `npm run dev`

## Notes

- Uses KV TTL to auto-expire user records (default ~21 days).
- Uses a Durable Object for user storage/matching so updates are strongly consistent (prevents UUID takeover).
- KV is used for best-effort rate limiting (short-lived counters).
