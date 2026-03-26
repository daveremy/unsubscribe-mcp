# PRD: unsubscribe-mcp

## Problem Statement

During email triage, Dave's Franklin agent identifies newsletters and promotional emails that should be unsubscribed. Today, unsubscribing requires opening each email in a browser, finding the unsubscribe link, clicking through confirmation pages — a tedious, manual process that breaks the CLI-first workflow.

Most marketing emails include a `List-Unsubscribe` header (required by Gmail since 2024 for bulk senders). This header provides machine-readable unsubscribe mechanisms that can be automated without a browser.

## Goals

1. **Zero-click unsubscribe** — Franklin can unsubscribe from newsletters during triage without Dave opening a browser
2. **High coverage** — Handle ~90% of unsubscribe cases automatically (RFC 8058 POST + HTTPS GET + mailto)
3. **Safe execution** — Never auto-unsubscribe without explicit confirmation; log all actions
4. **No new auth** — Piggyback on existing `gws` Gmail OAuth credentials
5. **Drop-in MCP** — Works as a Claude Code plugin, matching existing plugin conventions

## Non-Goals

- Parsing unsubscribe links from email body HTML (v2)
- Managing Gmail filters or labels
- Tracking resubscription or verifying unsubscribe success over time
- Supporting non-Gmail email providers
- Building a web UI

## Approach

### Auth Strategy

The server reuses Gmail OAuth tokens from `gws` (Google Workspace CLI), which Dave already has installed and authenticated. At startup:

1. Check if `gws` is installed (`which gws`)
2. Locate the gws credential store (`~/.config/gws/` or platform equivalent)
3. Read the OAuth access token and refresh token
4. Use the Gmail API directly with those credentials
5. If gws is not installed or has no tokens, return a clear error: "Gmail access required. Run: `npm i -g @googleworkspace/cli && gws auth`"

This avoids any separate OAuth flow, consent screen, or credential management.

### Unsubscribe Methods (priority order)

1. **RFC 8058 One-Click POST** (~70-80% of senders)
   - Header: `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
   - Action: POST to the HTTPS URL from `List-Unsubscribe` with body `List-Unsubscribe=One-Click`
   - Most reliable, no confirmation page needed

2. **HTTPS GET fallback** (~10-15%)
   - Header contains `<https://...>` URL but no `List-Unsubscribe-Post`
   - Action: GET the URL (follow redirects, max 5 hops)
   - May land on a confirmation page — report success based on 2xx response

3. **Mailto fallback** (~10-15%)
   - Header contains `<mailto:unsub@example.com?subject=...>`
   - Action: Send an email via Gmail API to the mailto address with the specified subject/body
   - Some senders only support this method

4. **Body-only links** (v2, flag as "manual needed")
   - No `List-Unsubscribe` header; link only exists in email body HTML
   - Out of scope for v1; tool reports "no machine-readable unsubscribe method found"

### Header Parsing

The `List-Unsubscribe` header format (RFC 2369):
```
List-Unsubscribe: <https://example.com/unsub?id=123>, <mailto:unsub@example.com?subject=unsub>
```

Key parsing rules:
- Values are comma-separated, each wrapped in angle brackets `< >`
- Can contain multiple URLs (both https and mailto)
- The `List-Unsubscribe-Post` header, when present, indicates RFC 8058 support
- Must handle: missing headers, malformed values, multiple URLs, URL-encoded parameters

## Tools Specification

### 1. `list_subscriptions`

**Purpose:** Discover newsletters/bulk senders in the inbox.

**Parameters:**
- `max_results` (number, optional, default 50) — max messages to scan
- `query` (string, optional) — additional Gmail search query to narrow scope

**Behavior:**
1. Search Gmail for messages with `List-Unsubscribe` headers using `has:unsubscribe` or header search
2. Group results by sender (From address)
3. For each sender, return: sender name, email, message count, most recent date, sample subject
4. Sort by message count descending

**Returns:** Array of sender summaries with subscription metadata.

### 2. `get_unsubscribe_info`

**Purpose:** Analyze unsubscribe options for a specific message or sender.

**Parameters:**
- `message_id` (string, required) — Gmail message ID

**Behavior:**
1. Fetch the message headers via Gmail API
2. Parse `List-Unsubscribe` and `List-Unsubscribe-Post` headers
3. Classify available methods: one-click POST, HTTPS GET, mailto
4. Return the recommended method and all available options

**Returns:** Parsed unsubscribe info with method ranking and raw header values.

### 3. `unsubscribe`

**Purpose:** Execute an unsubscribe action.

**Parameters:**
- `message_id` (string, required) — Gmail message ID to unsubscribe from
- `method` (string, optional) — Force a specific method: "post", "get", "mailto". If omitted, uses the best available method.
- `dry_run` (boolean, optional, default false) — If true, show what would happen without executing

**Behavior:**
1. Parse the unsubscribe headers
2. Attempt methods in priority order (POST > GET > mailto) unless method is forced
3. For POST: send `List-Unsubscribe=One-Click` to the HTTPS URL
4. For GET: fetch the HTTPS URL (follow redirects)
5. For mailto: send email via Gmail API with specified subject/body
6. Log the attempt and result
7. Return success/failure with details

**Returns:** Execution result with method used, HTTP status, and any error details.

### 4. `bulk_unsubscribe`

**Purpose:** Unsubscribe from multiple senders in one call.

**Parameters:**
- `message_ids` (string[], required) — Array of Gmail message IDs (one per sender)
- `dry_run` (boolean, optional, default false) — Preview mode

**Behavior:**
1. Process each message_id sequentially (to avoid rate limiting)
2. Use the same logic as `unsubscribe` for each
3. Collect results

**Returns:** Array of results, one per message_id, with overall success/failure summary.

### 5. `unsubscribe_status`

**Purpose:** View the log of unsubscribe attempts.

**Parameters:**
- `limit` (number, optional, default 20) — Number of recent entries
- `sender` (string, optional) — Filter by sender email/name

**Behavior:**
1. Read from the in-memory action log (persists for the session)
2. Filter and return entries

**Returns:** Array of log entries with timestamp, sender, method, result, and any error.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| gws token format changes | Auth breaks | Pin to known token file locations; clear error message |
| Rate limiting by Gmail API | Bulk operations fail | Sequential processing with delays; respect 429 responses |
| RFC 8058 POST rejected by sender | Unsubscribe fails silently | Verify response status; fall back to GET then mailto |
| Mailto unsubscribe not processed | Sender ignores email | Log as "attempted" not "confirmed"; note in status |
| Token refresh needed mid-session | API calls fail with 401 | Detect 401, attempt token refresh using gws refresh token |

## Success Metrics

- Franklin can unsubscribe from a newsletter in a single conversational turn
- 80%+ of unsubscribe attempts succeed on first try
- Zero unintended unsubscribes (always requires explicit confirmation)

## Implementation Phases

### Phase 1: Scaffold (this PR)
- Project structure, build system, MCP server with stub tools
- Parser module structure
- Plugin manifest, skill definition, documentation

### Phase 2: Core Implementation
- Gmail client with gws credential reading
- List-Unsubscribe header parser (RFC 2369 + RFC 8058)
- `get_unsubscribe_info` and `unsubscribe` tools (POST + GET)
- Basic action logging

### Phase 3: Full Coverage
- `list_subscriptions` with sender grouping
- `bulk_unsubscribe` with rate limiting
- Mailto fallback via Gmail API send
- `unsubscribe_status` with filtering

### Phase 4: Hardening
- Error recovery and retry logic
- Token refresh handling
- Edge case parsing (malformed headers, encoded URLs)
- Integration tests against real Gmail
