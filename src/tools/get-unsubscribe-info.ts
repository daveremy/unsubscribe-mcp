import type { GmailClient } from "../client.js";
import type { UnsubscribeInfo, ToolResponse } from "../types.js";
import {
  parseListUnsubscribeHeader,
  isOneClickSupported,
  extractHttpsUrls,
  extractMailtoUrls,
  rankMethods,
  getHeader,
} from "../parser.js";
import { textResult, errorTextResult } from "./format.js";

export interface GetUnsubscribeInfoArgs {
  message_id: string;
}

export async function handleGetUnsubscribeInfo(
  client: GmailClient,
  args: GetUnsubscribeInfoArgs,
): Promise<ToolResponse> {
  let message;
  try {
    message = await client.getMessage(args.message_id, "metadata");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorTextResult(`Failed to fetch message ${args.message_id}: ${msg}`);
  }

  const headers = message.payload.headers;

  const from = getHeader(headers, "From") ?? "";
  const subject = getHeader(headers, "Subject") ?? "(no subject)";
  const listUnsub = getHeader(headers, "List-Unsubscribe");
  const listUnsubPost = getHeader(headers, "List-Unsubscribe-Post");

  if (!listUnsub) {
    const info: UnsubscribeInfo = {
      messageId: args.message_id,
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
    return textResult(JSON.stringify(info, null, 2));
  }

  const allUrls = parseListUnsubscribeHeader(listUnsub);
  const httpsUrls = extractHttpsUrls(allUrls);
  const mailtoUrls = extractMailtoUrls(allUrls);
  const supportsOneClick = isOneClickSupported(listUnsubPost);
  const availableMethods = rankMethods(httpsUrls, mailtoUrls, supportsOneClick);

  const info: UnsubscribeInfo = {
    messageId: args.message_id,
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

  return textResult(JSON.stringify(info, null, 2));
}

/**
 * Extract display name from a From header like "Name <email>" or just "email".
 */
function parseSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.replace(/<[^>]+>/, "").trim() || from;
}

/**
 * Extract email address from a From header like "Name <email>" or just "email".
 */
function parseSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return from.trim();
}
