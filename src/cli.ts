#!/usr/bin/env node
import { Command } from "commander";
import { GmailClient } from "./client.js";
import { handleListSubscriptions } from "./tools/list-subscriptions.js";
import { handleGetUnsubscribeInfo } from "./tools/get-unsubscribe-info.js";
import { handleUnsubscribe } from "./tools/unsubscribe.js";
import { handleBulkUnsubscribe } from "./tools/bulk-unsubscribe.js";
import { handleUnsubscribeStatus } from "./tools/unsubscribe-status.js";
import { VERSION } from "./version.js";
import type { ToolResponse } from "./types.js";

const program = new Command();

program
  .name("unsubscribe")
  .description(
    "Email unsubscribe CLI — RFC 8058 one-click, GET fallback, mailto support",
  )
  .version(VERSION);

async function getClient(): Promise<GmailClient> {
  return GmailClient.fromGws();
}

function printResult(result: ToolResponse) {
  for (const block of result.content) {
    if (result.isError) {
      console.error(block.text);
    } else {
      console.log(block.text);
    }
  }
  if (result.isError) process.exit(1);
}

program
  .command("list")
  .description("List newsletter subscriptions found in Gmail")
  .option("--max <n>", "Max messages to scan", "50")
  .option("--query <q>", "Additional Gmail search query")
  .action(async (opts) => {
    const maxResults = parseInt(opts.max);
    if (isNaN(maxResults) || maxResults < 1) {
      console.error("Error: --max must be a positive number");
      process.exit(1);
    }
    const client = await getClient();
    const result = await handleListSubscriptions(client, {
      max_results: maxResults,
      query: opts.query,
    });
    printResult(result);
  });

program
  .command("info")
  .description("Show unsubscribe options for a specific message")
  .argument("<message_id>", "Gmail message ID")
  .action(async (messageId) => {
    const client = await getClient();
    const result = await handleGetUnsubscribeInfo(client, {
      message_id: messageId,
    });
    printResult(result);
  });

program
  .command("unsub")
  .description("Unsubscribe from a sender")
  .argument("<message_id>", "Gmail message ID")
  .option("--method <method>", "Force method: post, get, or mailto")
  .option("--dry-run", "Preview without executing")
  .action(async (messageId, opts) => {
    const client = await getClient();
    const result = await handleUnsubscribe(client, {
      message_id: messageId,
      method: opts.method,
      dry_run: opts.dryRun ?? false,
    });
    printResult(result);
  });

program
  .command("bulk")
  .description("Unsubscribe from multiple senders")
  .argument("<message_ids...>", "Gmail message IDs (space-separated)")
  .option("--dry-run", "Preview without executing")
  .action(async (messageIds, opts) => {
    const client = await getClient();
    const result = await handleBulkUnsubscribe(client, {
      message_ids: messageIds,
      dry_run: opts.dryRun ?? false,
    });
    printResult(result);
  });

program
  .command("status")
  .description("View unsubscribe attempt log")
  .option("--limit <n>", "Number of entries", "20")
  .option("--sender <s>", "Filter by sender")
  .action(async (opts) => {
    const limit = parseInt(opts.limit);
    const result = await handleUnsubscribeStatus({
      limit: isNaN(limit) ? 20 : limit,
      sender: opts.sender,
    });
    printResult(result);
  });

program.parseAsync().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
