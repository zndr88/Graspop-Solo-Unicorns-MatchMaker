# gras-worker

Cloudflare Worker backend for the Graspop Matchmaker MVP.

## Endpoints

- `GET /api/health`
- `PUT /api/me` `{ id, token, nickname, selectedBands[] }`
- `DELETE /api/me` `{ id, token }`
- `GET /api/matches?id=<uuid>`
- Admin (requires `Authorization: Bearer <ADMIN_TOKEN>`):
  - `GET /api/admin/search?nickname=<partial>`
  - `POST /api/admin/delete` `{ key }`

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
- The KV namespace `id` in `wrangler.toml` is not a secret; don’t commit API tokens or `.dev.vars`.

## Admin cleanup (orphaned profiles)

If someone created a profile in incognito and you can’t delete it normally, set an admin token and delete it.

1. Set secret (local deploy):
   - `npx wrangler secret put ADMIN_TOKEN`
2. Find the profile key:
   - `GET /api/admin/search?nickname=MyRealNick`
3. Delete it:
   - `POST /api/admin/delete` with JSON `{ "key": "<key>" }`
