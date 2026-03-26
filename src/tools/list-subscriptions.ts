import type { GmailClient } from "../client.js";
import type { SenderSummary, ToolResponse } from "../types.js";
import { textResult, errorTextResult } from "./format.js";
import { getHeader } from "../parser.js";

export interface ListSubscriptionsArgs {
  max_results?: number;
  query?: string;
}

export async function handleListSubscriptions(
  client: GmailClient,
  args: ListSubscriptionsArgs,
): Promise<ToolResponse> {
  const maxResults = args.max_results ?? 50;
  const baseQuery = "has:unsubscribe";
  const query = args.query ? `${baseQuery} ${args.query}` : baseQuery;

  // Search for messages with List-Unsubscribe headers
  let searchResult;
  try {
    searchResult = await client.searchMessages(query, maxResults);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorTextResult(`Failed to search Gmail: ${msg}`);
  }

  const messageRefs = searchResult.messages ?? [];
  if (messageRefs.length === 0) {
    return textResult(
      JSON.stringify(
        {
          total: 0,
          senders: [],
          message: "No messages with List-Unsubscribe headers found.",
        },
        null,
        2,
      ),
    );
  }

  // Fetch headers for each message and group by sender
  const senderMap = new Map<
    string,
    {
      senderName: string;
      senderEmail: string;
      messageCount: number;
      latestDate: string;
      latestSubject: string;
      latestMessageId: string;
    }
  >();

  // Process sequentially to avoid rate limits
  for (const ref of messageRefs) {
    let message;
    try {
      message = await client.getMessage(ref.id, "metadata");
    } catch {
      // Skip messages we can't fetch
      continue;
    }

    const headers = message.payload.headers;
    const from = getHeader(headers, "From") ?? "";
    const subject = getHeader(headers, "Subject") ?? "(no subject)";
    const date = getHeader(headers, "Date") ?? "";
    const listUnsub = getHeader(headers, "List-Unsubscribe");

    // Only include messages that actually have the header
    if (!listUnsub) continue;

    const senderEmail = parseSenderEmail(from);
    const senderName = parseSenderName(from);

    const existing = senderMap.get(senderEmail);
    if (!existing) {
      senderMap.set(senderEmail, {
        senderName,
        senderEmail,
        messageCount: 1,
        latestDate: date,
        latestSubject: subject,
        latestMessageId: ref.id,
      });
    } else {
      existing.messageCount++;
      // Keep the most recent (first in list — Gmail returns newest first)
      // latestDate/subject/messageId already set to first seen = most recent
    }
  }

  // Sort by message count descending
  const senders: SenderSummary[] = Array.from(senderMap.values()).sort(
    (a, b) => b.messageCount - a.messageCount,
  );

  return textResult(
    JSON.stringify(
      {
        total: senders.length,
        scanned: messageRefs.length,
        senders,
      },
      null,
      2,
    ),
  );
}

function parseSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.replace(/<[^>]+>/, "").trim() || from;
}

function parseSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return from.trim();
}
