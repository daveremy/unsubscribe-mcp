# unsubscribe-mcp

MCP server and CLI for unsubscribing from email newsletters via List-Unsubscribe headers.

## Architecture

- `src/types.ts` — TypeScript types for Gmail API, unsubscribe info, and tool responses
- `src/parser.ts` — List-Unsubscribe header parsing (RFC 2369 + RFC 8058)
- `src/client.ts` — `GmailClient` class using gws OAuth credentials
- `src/tools/format.ts` — MCP tool response helpers
- `src/tools/status-log.ts` — In-memory session log for unsubscribe attempts
- `src/tools/list-subscriptions.ts` — Discover newsletters by sender
- `src/tools/get-unsubscribe-info.ts` — Parse unsubscribe options for a message
- `src/tools/unsubscribe.ts` — Execute unsubscribe (POST > GET > mailto)
- `src/tools/bulk-unsubscribe.ts` — Batch unsubscribe
- `src/tools/unsubscribe-status.ts` — View session action log
- `src/mcp.ts` — MCP server entry point (stdio transport)
- `src/cli.ts` — CLI entry point using commander

## Auth Strategy

This server piggybacks on `gws` (Google Workspace CLI) credentials. No separate OAuth flow.

1. gws stores credentials at `~/.config/gws/credentials.json`
2. Client secret at `~/.config/gws/client_secret.json`
3. At startup, GmailClient reads these files and uses the access token for Gmail API calls
4. If gws is not installed or has no tokens, the server returns a clear error with setup instructions

**Required gws scopes:**
- `https://www.googleapis.com/auth/gmail.readonly` — reading message headers
- `https://www.googleapis.com/auth/gmail.send` — mailto unsubscribe fallback (Phase 3)

## Unsubscribe Methods (priority order)

1. **RFC 8058 One-Click POST** — `List-Unsubscribe-Post: List-Unsubscribe=One-Click` + HTTPS URL
2. **HTTPS GET fallback** — follow the HTTPS URL from `List-Unsubscribe` header
3. **Mailto fallback** — send email to the mailto address from `List-Unsubscribe` header
4. **Manual** — no machine-readable method found (body-only links, v2)

## Dev

- `npm run dev -- list` — run CLI via tsx (no build needed)
- `npm run build` — compile TypeScript to dist/
- `npm run release` — version bump, build, tag, publish

## CLI Commands

- `unsubscribe list [--max N] [--query Q]` — list newsletter subscriptions
- `unsubscribe info <message_id>` — show unsubscribe options
- `unsubscribe unsub <message_id> [--method post|get|mailto] [--dry-run]` — execute unsubscribe
- `unsubscribe bulk <id1> <id2> ... [--dry-run]` — batch unsubscribe
- `unsubscribe status [--limit N] [--sender S]` — view attempt log

## Implementation Status

- Phase 1 (scaffold): DONE — project structure, MCP server with stub tools, parser module
- Phase 2 (core): TODO — Gmail client integration, header parsing, unsubscribe execution
- Phase 3 (full): TODO — list_subscriptions, bulk, mailto send
- Phase 4 (hardening): TODO — retry logic, token refresh, edge cases
