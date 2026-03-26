import type { ToolResponse } from "../types.js";
import { textResult } from "./format.js";
import { getLogEntries } from "./status-log.js";

export interface UnsubscribeStatusArgs {
  limit?: number;
  sender?: string;
}

export async function handleUnsubscribeStatus(
  args: UnsubscribeStatusArgs,
): Promise<ToolResponse> {
  const limit = args.limit ?? 20;
  const sender = args.sender;

  let entries = getLogEntries();

  if (sender) {
    const lower = sender.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.senderEmail.toLowerCase().includes(lower) ||
        (e.senderName && e.senderName.toLowerCase().includes(lower)),
    );
  }

  // Most recent first, limited
  const effectiveLimit = Math.max(1, limit);
  entries = entries.slice(-effectiveLimit).reverse();

  if (entries.length === 0) {
    return textResult(
      JSON.stringify(
        {
          status: "empty",
          message: "No unsubscribe attempts logged yet.",
          total: 0,
        },
        null,
        2,
      ),
    );
  }

  return textResult(
    JSON.stringify(
      {
        total: entries.length,
        entries,
      },
      null,
      2,
    ),
  );
}
