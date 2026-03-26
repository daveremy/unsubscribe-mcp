import type { GmailClient } from "../client.js";
import type { UnsubscribeInfo, ToolResponse } from "../types.js";
import {
  parseListUnsubscribeHeader,
  isOneClickSupported,
  extractHttpsUrls,
  extractMailtoUrls,
  rankMethods,
  getHeader,
  parseSenderName,
  parseSenderEmail,
} from "../parser.js";
import { textResult, errorTextResult } from "./format.js";

export interface GetUnsubscribeInfoArgs {
  message_id: string;
}

/**
 * Fetch and parse unsubscribe info for a message.
 * Returns a typed UnsubscribeInfo or throws on API failure.
 *
 * This is the shared implementation used by both the MCP tool wrapper
 * and unsubscribe.ts (to avoid re-parsing JSON output between tools).
 */
export async function fetchUnsubscribeInfo(
  client: GmailClient,
  messageId: string,
): Promise<UnsubscribeInfo> {
  const message = await client.getMessage(messageId, "metadata");
  const headers = message.payload.headers;

  const from = getHeader(headers, "From") ?? "";
  const subject = getHeader(headers, "Subject") ?? "(no subject)";
  const listUnsub = getHeader(headers, "List-Unsubscribe");
  const listUnsubPost = getHeader(headers, "List-Unsubscribe-Post");

  if (!listUnsub) {
    return {
      messageId,
      senderName: parseSenderName(from),
      senderEmail: parseSenderEmail(from),
      subject,
      rawHeader: "",
      httpsUrls: [],
      mailtoUrls: [],
      supportsOneClick: false,
      recommendedMethod: "manual",
      availableMethods: ["manual"],
    };
  }

  const allUrls = parseListUnsubscribeHeader(listUnsub);
  const httpsUrls = extractHttpsUrls(allUrls);
  const mailtoUrls = extractMailtoUrls(allUrls);
  const supportsOneClick = isOneClickSupported(listUnsubPost);
  const availableMethods = rankMethods(httpsUrls, mailtoUrls, supportsOneClick);

  return {
    messageId,
    senderName: parseSenderName(from),
    senderEmail: parseSenderEmail(from),
    subject,
    rawHeader: listUnsub,
    rawPostHeader: listUnsubPost,
    httpsUrls,
    mailtoUrls,
    supportsOneClick,
    recommendedMethod: availableMethods[0],
    availableMethods,
  };
}

export async function handleGetUnsubscribeInfo(
  client: GmailClient,
  args: GetUnsubscribeInfoArgs,
): Promise<ToolResponse> {
  try {
    const info = await fetchUnsubscribeInfo(client, args.message_id);
    return textResult(JSON.stringify(info, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorTextResult(`Failed to fetch message ${args.message_id}: ${msg}`);
  }
}

