import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createDecipheriv } from "node:crypto";
import type {
  GmailMessage,
  GmailMessageListResponse,
} from "./types.js";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

interface GwsCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  type: string;
}

/**
 * Gmail API client that piggybacks on gws (Google Workspace CLI) credentials.
 *
 * Auth strategy:
 * 1. Read ~/.config/gws/.encryption_key and decrypt credentials.enc (AES-256-GCM)
 * 2. Exchange refresh token for a fresh access token via Google OAuth2 endpoint
 * 3. Use Gmail API directly with that access token
 *
 * Falls back to plaintext credentials.json if the encrypted file is unavailable.
 * Note: gws auth export redacts tokens — do NOT use it; read the files directly.
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
   * Reads the encrypted gws credential store at ~/.config/gws/.
   */
  static async fromGws(): Promise<GmailClient> {
    const configDir = join(homedir(), ".config", "gws");
    const creds = await GmailClient.readGwsCredentials(configDir);

    const { accessToken, grantedScopes } = await GmailClient.refreshAccessToken(
      creds.client_id,
      creds.client_secret,
      creds.refresh_token,
    );

    GmailClient.validateScopes(grantedScopes);

    return new GmailClient(
      accessToken,
      creds.refresh_token,
      creds.client_id,
      creds.client_secret,
      grantedScopes,
    );
  }

  /**
   * Read and decrypt gws credentials from ~/.config/gws/.
   * Tries encrypted credentials.enc first, then plaintext credentials.json.
   *
   * IMPORTANT: gws auth export redacts credentials (truncates refresh_token,
   * client_secret). We must read the files directly.
   *
   * Encryption: AES-256-GCM
   * Key file:   .encryption_key  (base64url, no padding, 32-byte key)
   * Data file:  credentials.enc  ([12B nonce][ciphertext][16B auth tag])
   */
  private static async readGwsCredentials(
    configDir: string,
  ): Promise<GwsCredentials> {
    const encKeyPath = join(configDir, ".encryption_key");
    const encCredPath = join(configDir, "credentials.enc");

    try {
      const keyB64 = (await readFile(encKeyPath, "utf-8")).trim();
      // Key is base64url without padding — add == for Buffer.from compatibility
      const key = Buffer.from(keyB64 + "==", "base64");
      const data = await readFile(encCredPath);

      // Layout: [12-byte nonce][ciphertext][16-byte GCM auth tag]
      const nonce = data.subarray(0, 12);
      const tag = data.subarray(data.length - 16);
      const ct = data.subarray(12, data.length - 16);

      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
      const parsed = JSON.parse(plain.toString("utf-8")) as GwsCredentials;

      if (!parsed.refresh_token || !parsed.client_id || !parsed.client_secret) {
        throw new Error("Decrypted credentials are incomplete");
      }
      return parsed;
    } catch {
      // Fall back to plaintext credentials.json
      const plainPath = join(configDir, "credentials.json");
      try {
        const raw = await readFile(plainPath, "utf-8");
        const parsed = JSON.parse(raw) as GwsCredentials;
        if (!parsed.refresh_token || !parsed.client_id || !parsed.client_secret) {
          throw new Error("Credentials file is incomplete");
        }
        return parsed;
      } catch {
        throw new Error(
          "Gmail access required. gws credentials not found or could not be decrypted.\n" +
            "Install and authenticate: npm i -g @googleworkspace/cli && gws auth login\n" +
            `Expected: ${configDir}/credentials.enc or ${configDir}/credentials.json`,
        );
      }
    }
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
   * Accepts any scope that implies Gmail read access (readonly, modify, mail.google.com).
   * Warns if gmail.send is missing (needed for mailto fallback).
   */
  private static validateScopes(grantedScopes: string[]): void {
    // If scope list is empty, token may be valid but we can't verify.
    // Don't throw — let the API call fail with a clear error if unauthorized.
    if (grantedScopes.length === 0) return;

    // Broader scopes (modify, full access, legacy mail.google.com) all imply read access.
    const readImplyingScopes = [
      GMAIL_READONLY_SCOPE,
      GMAIL_MODIFY_SCOPE,
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
      grantedScopes.includes(GMAIL_MODIFY_SCOPE) ||
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
   * Check if mailto unsubscribes are supported (gmail.send or gmail.modify scope present).
   */
  hasMailtoSupport(): boolean {
    if (this.grantedScopes.length === 0) return true; // assume yes if unknown
    return (
      this.grantedScopes.includes(GMAIL_SEND_SCOPE) ||
      this.grantedScopes.includes(GMAIL_MODIFY_SCOPE) ||
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

    // base64url encoding (Node 14.18+)
    const encoded = Buffer.from(raw).toString("base64url");

    await this.request<unknown>("/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw: encoded }),
    });
  }
}
