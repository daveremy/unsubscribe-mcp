import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  GmailMessage,
  GmailMessageListResponse,
} from "./types.js";

const execFileAsync = promisify(execFile);

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

/**
 * Gmail API client that piggybacks on gws (Google Workspace CLI) credentials.
 *
 * Auth strategy:
 * 1. Run `gws auth export` to get the decrypted refresh token + client credentials
 * 2. Exchange refresh token for an access token via Google OAuth2 token endpoint
 * 3. Use Gmail API directly with that access token
 * 4. If gws is not installed or not authenticated, throw with helpful error
 */
export class GmailClient {
  private accessToken: string;
  private refreshToken: string;
  private clientId: string;
  private clientSecret: string;
  private baseUrl = "https://gmail.googleapis.com/gmail/v1/users/me";
  private grantedScopes: string[] = [];

  private constructor(
    accessToken: string,
    refreshToken: string,
    clientId: string,
    clientSecret: string,
    grantedScopes: string[],
  ) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.grantedScopes = grantedScopes;
  }

  /**
   * Create a GmailClient from gws credentials.
   * Shells out to `gws auth export` to read decrypted credentials.
   */
  static async fromGws(): Promise<GmailClient> {
    let exported: {
      client_id: string;
      client_secret: string;
      refresh_token: string;
      type: string;
    };

    try {
      // Find gws binary — may be in PATH or common locations
      const gwsPaths = [
        "gws",
        "/opt/homebrew/bin/gws",
        "/usr/local/bin/gws",
      ];
      let output = "";
      let lastError: Error | null = null;

      for (const gwsPath of gwsPaths) {
        try {
          const result = await execFileAsync(gwsPath, ["auth", "export"]);
          output = result.stdout;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      if (!output) {
        throw (
          lastError ??
          new Error("gws not found — install with: npm i -g @googleworkspace/cli")
        );
      }

      // gws may output a preamble line before the JSON (e.g. "Using keyring backend: keyring")
      const jsonStart = output.indexOf("{");
      if (jsonStart === -1) {
        throw new Error("gws auth export returned no JSON — run: gws auth login");
      }
      exported = JSON.parse(output.slice(jsonStart));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("not found") ||
        msg.includes("ENOENT") ||
        msg.includes("command not found")
      ) {
        throw new Error(
          "Gmail access required. gws CLI not found.\n" +
            "Run: npm i -g @googleworkspace/cli && gws auth login",
        );
      }
      if (msg.includes("No credentials") || msg.includes("not authenticated")) {
        throw new Error(
          "Gmail access required. gws is not authenticated.\n" +
            "Run: gws auth login",
        );
      }
      throw new Error(`Failed to read gws credentials: ${msg}`);
    }

    if (!exported.refresh_token || !exported.client_id || !exported.client_secret) {
      throw new Error(
        "Gmail access required. gws credentials are incomplete.\n" +
          "Run: gws auth login",
      );
    }

    // Exchange refresh token for access token
    const { accessToken, grantedScopes } = await GmailClient.refreshAccessToken(
      exported.client_id,
      exported.client_secret,
      exported.refresh_token,
    );

    // Validate that a Gmail read scope is present
    GmailClient.validateScopes(grantedScopes);

    return new GmailClient(
      accessToken,
      exported.refresh_token,
      exported.client_id,
      exported.client_secret,
      grantedScopes,
    );
  }

  /**
   * Exchange a refresh token for a new access token.
   * Returns the access token and the list of granted scopes.
   */
  private static async refreshAccessToken(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ): Promise<{ accessToken: string; grantedScopes: string[] }> {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Token refresh failed (${response.status}): ${body}\n` +
          "Run: gws auth login",
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      scope?: string;
      expires_in?: number;
    };

    if (!data.access_token) {
      throw new Error("Token refresh returned no access_token. Run: gws auth login");
    }

    const grantedScopes = data.scope ? data.scope.split(" ") : [];
    return { accessToken: data.access_token, grantedScopes };
  }

  /**
   * Validate that required Gmail scopes are present.
   * Accepts any scope that implies Gmail read access.
   * Warns if gmail.send is missing (needed for mailto fallback).
   */
  private static validateScopes(grantedScopes: string[]): void {
    // If scope list is empty, token may be valid but we can't verify.
    // Don't throw — let the API call fail with a clear error if unauthorized.
    if (grantedScopes.length === 0) return;

    // Broader scopes (modify, full access, legacy mail.google.com) all imply read access.
    const readImplyingScopes = [
      GMAIL_READONLY_SCOPE,
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.labels",
      "https://mail.google.com/",
    ];
    const hasReadScope = grantedScopes.some((s) =>
      readImplyingScopes.includes(s),
    );

    if (!hasReadScope) {
      throw new Error(
        "Gmail read scope is missing from gws credentials.\n" +
          "Re-authenticate with: gws auth login\n" +
          `Required scope: ${GMAIL_READONLY_SCOPE}`,
      );
    }

    // gmail.send is needed for mailto fallback — warn but don't fail
    const hasSendScope =
      grantedScopes.includes(GMAIL_SEND_SCOPE) ||
      grantedScopes.includes("https://mail.google.com/");
    if (!hasSendScope) {
      // Log to stderr so it doesn't pollute MCP stdio
      console.error(
        "[unsubscribe-mcp] Warning: gmail.send scope not granted — " +
          "mailto unsubscribe fallback will not work. Re-run: gws auth login",
      );
    }
  }

  /**
   * Check if mailto unsubscribes are supported (gmail.send scope present).
   */
  hasMailtoSupport(): boolean {
    if (this.grantedScopes.length === 0) return true; // assume yes if unknown
    return (
      this.grantedScopes.includes(GMAIL_SEND_SCOPE) ||
      this.grantedScopes.includes("https://mail.google.com/")
    );
  }

  /**
   * Make an authenticated request to the Gmail API.
   * Handles 401 by refreshing the token and retrying once.
   */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const doRequest = async (token: string): Promise<Response> => {
      const url = `${this.baseUrl}${path}`;
      return fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    };

    let response = await doRequest(this.accessToken);

    if (response.status === 401) {
      // Token expired — refresh and retry once
      try {
        const { accessToken } = await GmailClient.refreshAccessToken(
          this.clientId,
          this.clientSecret,
          this.refreshToken,
        );
        this.accessToken = accessToken;
        response = await doRequest(this.accessToken);
      } catch {
        throw new Error(
          "Gmail token expired and refresh failed.\n" +
            "Run: gws auth login",
        );
      }
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gmail API error ${response.status}: ${body}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Search for Gmail messages matching a query.
   */
  async searchMessages(
    query: string,
    maxResults: number = 50,
  ): Promise<GmailMessageListResponse> {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(maxResults),
    });
    return this.request<GmailMessageListResponse>(
      `/messages?${params.toString()}`,
    );
  }

  /**
   * Get a single message with headers.
   */
  async getMessage(
    messageId: string,
    format: "metadata" | "full" = "metadata",
  ): Promise<GmailMessage> {
    const params = new URLSearchParams({ format });
    if (format === "metadata") {
      params.append("metadataHeaders", "From");
      params.append("metadataHeaders", "Subject");
      params.append("metadataHeaders", "Date");
      params.append("metadataHeaders", "List-Unsubscribe");
      params.append("metadataHeaders", "List-Unsubscribe-Post");
    }
    return this.request<GmailMessage>(
      `/messages/${messageId}?${params.toString()}`,
    );
  }

  /**
   * Send an email via Gmail API (for mailto unsubscribe fallback).
   * Constructs an RFC 2822 message, base64url-encodes it, and POSTs to /messages/send.
   */
  async sendMessage(to: string, subject: string, body: string): Promise<void> {
    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ].join("\r\n");

    // Base64url encode: use native Node.js base64url encoding (Node 14.18+)
    const encoded = Buffer.from(raw).toString("base64url");

    await this.request<unknown>("/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: encoded }),
    });
  }
}
