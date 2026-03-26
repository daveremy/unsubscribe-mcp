import type { MailtoComponents, UnsubscribeMethod } from "./types.js";

/**
 * Parse a List-Unsubscribe header value into individual URLs.
 *
 * RFC 2369 format: `<https://example.com/unsub>, <mailto:unsub@example.com?subject=unsub>`
 * Values are comma-separated, each wrapped in angle brackets.
 */
export function parseListUnsubscribeHeader(header: string): string[] {
  if (!header || !header.trim()) return [];

  const urls: string[] = [];
  // Match content between angle brackets
  const matches = header.matchAll(/<([^>]+)>/g);
  for (const match of matches) {
    const url = match[1].trim();
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Check if the List-Unsubscribe-Post header indicates RFC 8058 one-click support.
 *
 * RFC 8058 requires: `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 */
export function isOneClickSupported(postHeader: string | undefined): boolean {
  if (!postHeader) return false;
  return postHeader.trim().toLowerCase() === "list-unsubscribe=one-click";
}

/**
 * Extract HTTPS URLs from a list of parsed unsubscribe URLs.
 */
export function extractHttpsUrls(urls: string[]): string[] {
  return urls.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
}

/**
 * Extract mailto URLs from a list of parsed unsubscribe URLs.
 */
export function extractMailtoUrls(urls: string[]): string[] {
  return urls.filter((url) => {
    try {
      return url.toLowerCase().startsWith("mailto:");
    } catch {
      return false;
    }
  });
}

/**
 * Parse a mailto URL into its components.
 *
 * Format: `mailto:address@example.com?subject=Unsubscribe&body=Please%20remove`
 */
export function parseMailtoUrl(mailtoUrl: string): MailtoComponents | null {
  if (!mailtoUrl.toLowerCase().startsWith("mailto:")) return null;

  try {
    const withoutScheme = mailtoUrl.slice(7); // Remove "mailto:"
    const [address, queryString] = withoutScheme.split("?", 2);

    const result: MailtoComponents = {
      to: decodeURIComponent(address),
    };

    if (queryString) {
      const params = new URLSearchParams(queryString);
      const subject = params.get("subject");
      const body = params.get("body");
      if (subject) result.subject = subject;
      if (body) result.body = body;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Determine available unsubscribe methods from parsed header data.
 * Returns methods ranked by preference: post > get > mailto > manual.
 */
export function rankMethods(
  httpsUrls: string[],
  mailtoUrls: string[],
  supportsOneClick: boolean,
): UnsubscribeMethod[] {
  const methods: UnsubscribeMethod[] = [];

  if (supportsOneClick && httpsUrls.length > 0) {
    methods.push("post");
  }

  if (httpsUrls.length > 0) {
    methods.push("get");
  }

  if (mailtoUrls.length > 0) {
    methods.push("mailto");
  }

  if (methods.length === 0) {
    methods.push("manual");
  }

  return methods;
}

/**
 * Extract the display name from a From header like "Name <email>" or just "email".
 */
export function parseSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.replace(/<[^>]+>/, "").trim() || from;
}

/**
 * Extract the email address from a From header like "Name <email>" or just "email".
 */
export function parseSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return from.trim();
}

/**
 * Extract a header value from Gmail message headers (case-insensitive).
 */
export function getHeader(
  headers: Array<{ name: string; value: string }>,
  headerName: string,
): string | undefined {
  const lower = headerName.toLowerCase();
  const header = headers.find((h) => h.name.toLowerCase() === lower);
  return header?.value;
}
