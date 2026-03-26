#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GmailClient } from "./client.js";
import { handleListSubscriptions } from "./tools/list-subscriptions.js";
import { handleGetUnsubscribeInfo } from "./tools/get-unsubscribe-info.js";
import { handleUnsubscribe } from "./tools/unsubscribe.js";
import { handleBulkUnsubscribe } from "./tools/bulk-unsubscribe.js";
import { handleUnsubscribeStatus } from "./tools/unsubscribe-status.js";
import { errorTextResult } from "./tools/format.js";
import { VERSION } from "./version.js";

const server = new McpServer({ name: "unsubscribe-mcp", version: VERSION });

let _client: GmailClient | undefined;
async function getClient(): Promise<GmailClient> {
  _client ??= await GmailClient.fromGws();
  return _client;
}

async function withClient<T>(
  fn: (client: GmailClient) => Promise<T>,
): Promise<T | ReturnType<typeof errorTextResult>> {
  try {
    return await fn(await getClient());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorTextResult(msg);
  }
}

server.tool(
  "list_subscriptions",
  "Search Gmail for messages with List-Unsubscribe headers, grouped by sender with frequency stats. Use to discover newsletters for potential unsubscribe.",
  {
    max_results: z
      .number()
      .min(1)
      .max(200)
      .optional()
      .describe("Max messages to scan (default 50)"),
    query: z
      .string()
      .optional()
      .describe("Additional Gmail search query to narrow scope"),
  },
  async (args) => withClient((c) => handleListSubscriptions(c, args)),
);

server.tool(
  "get_unsubscribe_info",
  "Parse List-Unsubscribe headers for a specific Gmail message. Returns available methods (RFC 8058 POST, HTTPS GET, mailto) ranked by preference.",
  {
    message_id: z.string().describe("Gmail message ID"),
  },
  async (args) => withClient((c) => handleGetUnsubscribeInfo(c, args)),
);

server.tool(
  "unsubscribe",
  "Execute an unsubscribe action for a Gmail message. Tries methods in order: RFC 8058 POST > HTTPS GET > mailto. Requires explicit confirmation before executing.",
  {
    message_id: z.string().describe("Gmail message ID to unsubscribe from"),
    method: z
      .enum(["post", "get", "mailto"])
      .optional()
      .describe("Force a specific method instead of auto-selecting"),
    dry_run: z
      .boolean()
      .optional()
      .describe("Preview what would happen without executing (default false)"),
  },
  async (args) => withClient((c) => handleUnsubscribe(c, args)),
);

server.tool(
  "bulk_unsubscribe",
  "Unsubscribe from multiple senders in one call. Processes sequentially to respect rate limits.",
  {
    message_ids: z
      .array(z.string())
      .min(1)
      .describe("Array of Gmail message IDs (one per sender to unsubscribe)"),
    dry_run: z
      .boolean()
      .optional()
      .describe("Preview what would happen without executing (default false)"),
  },
  async (args) => withClient((c) => handleBulkUnsubscribe(c, args)),
);

server.tool(
  "unsubscribe_status",
  "View the log of unsubscribe attempts from this session. Shows method used, success/failure, and any errors.",
  {
    limit: z
      .number()
      .min(1)
      .optional()
      .describe("Number of recent entries to return (default 20)"),
    sender: z
      .string()
      .optional()
      .describe("Filter by sender email or name"),
  },
  async (args) => handleUnsubscribeStatus(args),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`unsubscribe-mcp v${VERSION} running on stdio`);
}

main().catch((err) => {
  console.error("unsubscribe-mcp fatal error:", err);
  process.exit(1);
});
