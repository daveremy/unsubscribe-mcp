import type { GmailClient } from "../client.js";
import type { UnsubscribeResult, UnsubscribeMethod, ToolResponse } from "../types.js";
import { textResult, errorTextResult } from "./format.js";
import { addLogEntry } from "./status-log.js";
import { fetchUnsubscribeInfo } from "./get-unsubscribe-info.js";
import { parseMailtoUrl } from "../parser.js";

export interface UnsubscribeArgs {
  message_id: string;
  method?: string;
  dry_run?: boolean;
}

// Browser-like User-Agent to avoid WAF blocks on bare node-fetch headers
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export async function handleUnsubscribe(
  client: GmailClient,
  args: UnsubscribeArgs,
): Promise<ToolResponse> {
  const dryRun = args.dry_run ?? false;

  // Fetch and parse unsubscribe info
  let info;
  try {
    info = await fetchUnsubscribeInfo(client, args.message_id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorTextResult(`Failed to fetch message ${args.message_id}: ${msg}`);
  }

  // Validate and resolve method
  const forcedMethod = args.method as UnsubscribeMethod | undefined;
  if (forcedMethod && !info.availableMethods.includes(forcedMethod)) {
    return errorTextResult(
      `Method "${forcedMethod}" is not available for this message.\n` +
        `Available methods: ${info.availableMethods.join(", ")}`,
    );
  }

  const method: UnsubscribeMethod = forcedMethod ?? info.recommendedMethod;

  if (method === "manual") {
    return textResult(
      JSON.stringify(
        {
          status: "manual_required",
          message:
            "No machine-readable unsubscribe method found. " +
            "Open the email and click the unsubscribe link manually.",
          messageId: args.message_id,
          sender: info.senderEmail,
        },
        null,
        2,
      ),
    );
  }

  if (dryRun) {
    let description = "";
    if (method === "post") {
      description = `POST List-Unsubscribe=One-Click to ${info.httpsUrls[0]}`;
    } else if (method === "get") {
      description = `GET ${info.httpsUrls[0]} (follow redirects, max 5)`;
    } else if (method === "mailto") {
      const mailto = parseMailtoUrl(info.mailtoUrls[0]);
      description = mailto
        ? `Send email to ${mailto.to} with subject "${mailto.subject ?? "(none)"}"`
        : `Mailto: ${info.mailtoUrls[0]}`;
    }
    return textResult(
      JSON.stringify(
        {
          dry_run: true,
          method,
          description,
          messageId: args.message_id,
          sender: info.senderEmail,
        },
        null,
        2,
      ),
    );
  }

  // Execute the unsubscribe.
  // When a method is forced, try only that one.
  // When auto-selecting, walk the ranked methods until one succeeds.
  const timestamp = new Date().toISOString();
  const methodsToTry: UnsubscribeMethod[] = forcedMethod
    ? [forcedMethod]
    : info.availableMethods.filter((m) => m !== "manual");

  let lastResult: UnsubscribeResult | undefined;

  for (const tryMethod of methodsToTry) {
    let result: UnsubscribeResult;
    try {
      if (tryMethod === "post") {
        result = await executePost(
          args.message_id,
          info.senderEmail,
          info.httpsUrls[0],
          timestamp,
        );
      } else if (tryMethod === "get") {
        result = await executeGet(
          args.message_id,
          info.senderEmail,
          info.httpsUrls[0],
          timestamp,
        );
      } else {
        // mailto
        result = await executeMailto(
          client,
          args.message_id,
          info.senderEmail,
          info.mailtoUrls[0],
          timestamp,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result = {
        messageId: args.message_id,
        senderEmail: info.senderEmail,
        method: tryMethod,
        success: false,
        error: msg,
        timestamp,
      };
    }

    // Log every attempt
    addLogEntry({
      timestamp: result.timestamp,
      messageId: result.messageId,
      senderName: info.senderName,
      senderEmail: result.senderEmail,
      method: result.method,
      success: result.success,
      httpStatus: result.httpStatus,
      error: result.error,
    });

    lastResult = result;

    // Stop on success, or if a specific method was forced
    if (result.success || forcedMethod) break;
  }

  // Fallback: if no methods were attempted (shouldn't happen), return manual
  if (!lastResult) {
    return textResult(
      JSON.stringify(
        {
          status: "manual_required",
          message: "No executable unsubscribe methods available.",
          messageId: args.message_id,
          sender: info.senderEmail,
        },
        null,
        2,
      ),
    );
  }

  return textResult(JSON.stringify(lastResult, null, 2));
}

/**
 * RFC 8058 one-click POST: sends "List-Unsubscribe=One-Click" to the HTTPS URL.
 */
async function executePost(
  messageId: string,
  senderEmail: string,
  url: string,
  timestamp: string,
): Promise<UnsubscribeResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "List-Unsubscribe=One-Click",
    redirect: "follow",
  });

  return {
    messageId,
    senderEmail,
    method: "post",
    success: response.ok,
    httpStatus: response.status,
    error: response.ok
      ? undefined
      : `HTTP ${response.status}: ${response.statusText}`,
    timestamp,
  };
}

/**
 * HTTPS GET fallback: fetch the URL and follow redirects (max 5).
 * Reports success based on 2xx response.
 */
async function executeGet(
  messageId: string,
  senderEmail: string,
  url: string,
  timestamp: string,
): Promise<UnsubscribeResult> {
  // node's fetch follows redirects automatically with redirect: "follow".
  // Use response.ok (200-299) on the final resolved URL to confirm success.
  const response = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });

  const success = response.ok;

  return {
    messageId,
    senderEmail,
    method: "get",
    success,
    httpStatus: response.status,
    error: success
      ? undefined
      : `HTTP ${response.status}: ${response.statusText}`,
    timestamp,
  };
}

/**
 * Mailto fallback: send an unsubscribe email via Gmail API.
 */
async function executeMailto(
  client: GmailClient,
  messageId: string,
  senderEmail: string,
  mailtoUrl: string,
  timestamp: string,
): Promise<UnsubscribeResult> {
  if (!client.hasMailtoSupport()) {
    return {
      messageId,
      senderEmail,
      method: "mailto",
      success: false,
      error:
        "gmail.send scope not granted. Re-authenticate with: gws auth\n" +
        "(The unsubscribe email was NOT sent.)",
      timestamp,
    };
  }

  const mailto = parseMailtoUrl(mailtoUrl);
  if (!mailto) {
    return {
      messageId,
      senderEmail,
      method: "mailto",
      success: false,
      error: `Could not parse mailto URL: ${mailtoUrl}`,
      timestamp,
    };
  }

  await client.sendMessage(
    mailto.to,
    mailto.subject ?? "Unsubscribe",
    mailto.body ?? "Please unsubscribe me from this mailing list.",
  );

  return {
    messageId,
    senderEmail,
    method: "mailto",
    success: true,
    timestamp,
  };
}
