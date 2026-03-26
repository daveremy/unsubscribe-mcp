# unsubscribe-mcp

MCP server for email unsubscribe — RFC 8058 one-click, GET fallback, mailto support.

Lets Claude Code agents unsubscribe from newsletters during email triage. No browser, no manual clicks.

## Install as Claude Code Plugin

```bash
claude plugin marketplace add daveremy/unsubscribe-mcp
claude plugin install unsubscribe-mcp@unsubscribe-mcp-plugins --scope user
```

## Manual Install

Install globally and add to your MCP config:

```bash
npm install -g unsubscribe-mcp
```

Then add to your MCP config (`.mcp.json` or Claude Code settings):

```json
{
  "mcpServers": {
    "unsubscribe-mcp": {
      "command": "npx",
      "args": ["-y", "unsubscribe-mcp"]
    }
  }
}
```

## Auth Setup

This server uses your existing [gws](https://github.com/nicholasgasior/gws) (Google Workspace CLI) credentials for Gmail access. No separate OAuth setup needed.

```bash
# Install gws if you don't have it
npm install -g @googleworkspace/cli

# Authenticate with Gmail
gws auth
```

## Tools Reference

| Tool | Description |
|---|---|
| `list_subscriptions` | Search Gmail for newsletters, grouped by sender with frequency stats |
| `get_unsubscribe_info` | Parse List-Unsubscribe headers for a message — shows available methods |
| `unsubscribe` | Execute unsubscribe: RFC 8058 POST > HTTPS GET > mailto fallback |
| `bulk_unsubscribe` | Batch unsubscribe from multiple senders in one call |
| `unsubscribe_status` | View session log of unsubscribe attempts |

## CLI Usage

```bash
# List newsletter subscriptions
unsubscribe list --max 100

# Check unsubscribe options for a message
unsubscribe info <message_id>

# Unsubscribe (dry run first)
unsubscribe unsub <message_id> --dry-run
unsubscribe unsub <message_id>

# Batch unsubscribe
unsubscribe bulk <id1> <id2> <id3>

# View attempt log
unsubscribe status
```

## Skills

This plugin bundles an `/unsubscribe` skill for conversational email triage:

```
/unsubscribe              # List newsletters and prompt for action
/unsubscribe list         # Show all subscription candidates
/unsubscribe info <id>    # Inspect unsubscribe options for a message
/unsubscribe unsub <id>   # Unsubscribe from a specific message
/unsubscribe status       # View attempt log
```

The skill orchestrates the MCP tools with safety checks — it always confirms before executing, and logs all attempts.

## How It Works

Most marketing emails include a `List-Unsubscribe` header (required by Gmail since 2024 for bulk senders). This server parses that header and executes the unsubscribe automatically:

1. **RFC 8058 One-Click POST** (~70-80% of senders) — sends `List-Unsubscribe=One-Click` to the HTTPS URL
2. **HTTPS GET fallback** (~10-15%) — follows the unsubscribe URL
3. **Mailto fallback** (~10-15%) — sends an email to the unsubscribe address via Gmail API

## Development

```bash
# Install dependencies
npm install

# Run CLI in dev mode (no build needed)
npm run dev -- list

# Build
npm run build

# Verify package contents
npm pack --dry-run

# Release
npm run release patch
```

## License

MIT
