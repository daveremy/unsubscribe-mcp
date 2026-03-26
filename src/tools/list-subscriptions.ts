import type { GmailClient } from "../client.js";
import type { SenderSummary, ToolResponse } from "../types.js";
import { textResult, errorTextResult } from "./format.js";
import { getHeader, parseSenderName, parseSenderEmail } from "../parser.js";

export interface ListSubscriptionsArgs {
  max_results?: number;
  query?: string;
}

/** Max concurrent getMessage calls to avoid Gmail API rate limiting */
const FETCH_CONCURRENCY = 8;

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

  // Fetch headers in parallel with bounded concurrency
  const messages = await fetchConcurrent(
    messageRefs.map((ref) => () => client.getMessage(ref.id, "metadata").catch(() => null)),
    FETCH_CONCURRENCY,
  );

  // Group by sender email
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

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (!message) continue;

    const headers = message.payload.headers;
    const from = getHeader(headers, "From") ?? "";
    const subject = getHeader(headers, "Subject") ?? "(no subject)";
    const date = getHeader(headers, "Date") ?? "";
    const listUnsub = getHeader(headers, "List-Unsubscribe");

    // Only include messages that actually have the header
    if (!listUnsub) continue;

    const senderEmail = parseSenderEmail(from);
    const senderName = parseSenderName(from);
    const ref = messageRefs[i];

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
      // Gmail returns newest first; first-seen entry is already the most recent
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

/**
 * Execute an array of async tasks with bounded concurrency.
 */
async function fetchConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  const worker = async (): Promise<void> => {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

