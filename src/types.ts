/**
 * Parsed unsubscribe info from email headers.
 */
export interface UnsubscribeInfo {
  /** Gmail message ID */
  messageId: string;
  /** Sender display name */
  senderName: string;
  /** Sender email address */
  senderEmail: string;
  /** Subject line of the message */
  subject: string;
  /** Raw List-Unsubscribe header value */
  rawHeader: string;
  /** Raw List-Unsubscribe-Post header value, if present */
  rawPostHeader?: string;
  /** Parsed HTTPS URLs from List-Unsubscribe header */
  httpsUrls: string[];
  /** Parsed mailto URLs from List-Unsubscribe header */
  mailtoUrls: string[];
  /** Whether RFC 8058 one-click POST is supported */
  supportsOneClick: boolean;
  /** Recommended unsubscribe method */
  recommendedMethod: UnsubscribeMethod;
  /** All available methods, ranked by preference */
  availableMethods: UnsubscribeMethod[];
}

export type UnsubscribeMethod = "post" | "get" | "mailto" | "manual";

/**
 * Result of an unsubscribe attempt.
 */
export interface UnsubscribeResult {
  /** Gmail message ID */
  messageId: string;
  /** Sender email address */
  senderEmail: string;
  /** Method that was used */
  method: UnsubscribeMethod;
  /** Whether the attempt succeeded */
  success: boolean;
  /** HTTP status code (for POST/GET methods) */
  httpStatus?: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp of the attempt */
  timestamp: string;
}

/**
 * Sender subscription summary for list_subscriptions.
 */
export interface SenderSummary {
  /** Sender display name */
  senderName: string;
  /** Sender email address */
  senderEmail: string;
  /** Number of messages found */
  messageCount: number;
  /** Most recent message date */
  latestDate: string;
  /** Subject of most recent message */
  latestSubject: string;
  /** Gmail message ID of most recent message (use for unsubscribe) */
  latestMessageId: string;
}

/**
 * Parsed mailto URL components.
 */
export interface MailtoComponents {
  /** Recipient email address */
  to: string;
  /** Email subject */
  subject?: string;
  /** Email body */
  body?: string;
}

/**
 * Gmail API message header.
 */
export interface GmailHeader {
  name: string;
  value: string;
}

/**
 * Minimal Gmail API message structure (headers only).
 */
export interface GmailMessage {
  id: string;
  threadId: string;
  payload: {
    headers: GmailHeader[];
  };
}

/**
 * Gmail API message list response.
 */
export interface GmailMessageListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

/**
 * Tool response type matching MCP SDK expectations.
 * Index signature required by MCP SDK's CallToolResult type.
 */
export interface ToolResponse {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
