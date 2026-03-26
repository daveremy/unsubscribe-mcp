---
name: unsubscribe
description: Unsubscribe from email newsletters using List-Unsubscribe headers — RFC 8058 POST, GET fallback, mailto support
argument-hint: "[list | info <message_id> | unsub <message_id> | status]"
allowed-tools: mcp__unsubscribe-mcp__list_subscriptions, mcp__unsubscribe-mcp__get_unsubscribe_info, mcp__unsubscribe-mcp__unsubscribe, mcp__unsubscribe-mcp__bulk_unsubscribe, mcp__unsubscribe-mcp__unsubscribe_status
---

# /unsubscribe — Email Newsletter Unsubscribe

You have access to tools for discovering and unsubscribing from email newsletters via machine-readable List-Unsubscribe headers.

## Workflow

### List Subscriptions (`list` or default)
1. Use `list_subscriptions` to find newsletters in Gmail
2. Present results sorted by volume (most frequent senders first)
3. Show sender name, email, message count, and most recent subject
4. Ask which senders Dave wants to unsubscribe from

### Get Info (`info <message_id>`)
1. Use `get_unsubscribe_info` to analyze a specific message
2. Show available unsubscribe methods (POST, GET, mailto)
3. Highlight the recommended method

### Unsubscribe (`unsub <message_id>`)
1. **ALWAYS confirm with Dave before executing** — show sender and method first
2. Use `unsubscribe` with the message ID
3. Report success or failure with details
4. If failed, suggest trying a different method

### Bulk Unsubscribe
1. After listing subscriptions, Dave may select multiple senders
2. Confirm the full list before executing
3. Use `bulk_unsubscribe` with collected message IDs
4. Report per-sender results

### Status (`status`)
1. Use `unsubscribe_status` to show the session log
2. Highlight any failures that may need retry

## Safety Rules
- **NEVER unsubscribe without explicit Dave confirmation** — always show what will happen first
- Use `dry_run: true` when previewing
- Log all attempts for audit trail

## Presentation
- Lead with sender name and volume when listing
- Keep confirmations concise: "Unsubscribe from [Sender] via [method]?"
- After success: "Done — unsubscribed from [Sender]"
- After failure: "Failed — [reason]. Try --method get?"
