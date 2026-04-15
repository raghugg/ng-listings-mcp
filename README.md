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
1. Deploy `worker.js` to a Cloudflare Worker
2. Create a KV namespace and bind it to the worker with the variable name `LISTINGS_KV`
3. Add a cron trigger of `0 12 * * *` to run the daily fetch at 12:00 UTC
4. Add an `AUTH_TOKEN` secret via the Cloudflare dashboard for bearer token authentication
5. Connect to Claude Desktop via `mcp-remote` with the `Authorization: Bearer <token>` header
