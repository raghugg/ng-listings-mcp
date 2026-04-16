# ng-listings-mcp

A Cloudflare Worker MCP server for fetching new grad job listings from the [Simplify GitHub repo](https://github.com/SimplifyJobs/New-Grad-Positions).

## Features
- Fetches 0d listings daily at 12:00 UTC via cron trigger
- Parses job descriptions from Simplify, Workday, iCIMS, Lever, and other ATS platforms
- Caches results in KV with 7-day rolling window
- Supports retrieving listings by date or combining multiple days
- Bearer token authentication

## Tools
### `get_new_grad_listings`
- No params — today's listings
- `date="YYYY-MM-DD"` — specific day
- `days=N` — last N days combined

## Setup
1. Create a KV namespace in the Cloudflare dashboard named `LISTINGS_KV` and note the namespace ID
2. In `wrangler.toml`, replace the placeholder `id` under `[[kv_namespaces]]` with your KV namespace ID
3. Deploy to Cloudflare via `npx wrangler deploy` or by connecting the repo to a Cloudflare Worker with git integration
4. Add an `AUTH_TOKEN` secret via the Cloudflare dashboard for bearer token authentication
5. Connect to Claude Desktop via `mcp-remote` with the `Authorization: Bearer <token>` header

The cron trigger is set to `0 12 * * *` (daily at 12:00 UTC) by default and can be changed in `wrangler.toml`.
