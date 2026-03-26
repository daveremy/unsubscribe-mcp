import type { GmailClient } from "../client.js";
import type { UnsubscribeResult, ToolResponse } from "../types.js";
import { textResult, errorTextResult } from "./format.js";
import { handleUnsubscribe } from "./unsubscribe.js";

export interface BulkUnsubscribeArgs {
  message_ids: string[];
  dry_run?: boolean;
}

/** Delay between unsubscribe requests to respect Gmail API rate limits */
const INTER_REQUEST_DELAY_MS = 500;

export async function handleBulkUnsubscribe(
  client: GmailClient,
  args: BulkUnsubscribeArgs,
): Promise<ToolResponse> {
  if (!args.message_ids || args.message_ids.length === 0) {
    return errorTextResult("message_ids must be a non-empty array.");
  }

  const dryRun = args.dry_run ?? false;
  const results: unknown[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < args.message_ids.length; i++) {
    const messageId = args.message_ids[i];

    const result = await handleUnsubscribe(client, {
      message_id: messageId,
      dry_run: dryRun,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content[0].text);
    } catch {
      parsed = { messageId, error: result.content[0].text };
    }

    results.push(parsed);

    // Track success/failure from result
    if (result.isError) {
      failed++;
    } else {
      const r = parsed as { success?: boolean; dry_run?: boolean; status?: string };
      if (r.dry_run || r.status === "manual_required") {
        // Not a real attempt
      } else if (r.success === true) {
        succeeded++;
      } else if (r.success === false) {
        failed++;
      }
    }

    // Delay between requests (except after the last one)
    if (i < args.message_ids.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, INTER_REQUEST_DELAY_MS));
    }
  }

  return textResult(
    JSON.stringify(
      {
        dry_run: dryRun,
        total: args.message_ids.length,
        succeeded: dryRun ? undefined : succeeded,
        failed: dryRun ? undefined : failed,
        results,
      },
      null,
      2,
    ),
  );
}
