import type { UnsubscribeMethod } from "../types.js";

/**
 * In-memory log of unsubscribe attempts.
 * Persists for the lifetime of the MCP server session.
 */

export interface LogEntry {
  timestamp: string;
  messageId: string;
  senderName: string;
  senderEmail: string;
  method: UnsubscribeMethod;
  success: boolean;
  httpStatus?: number;
  error?: string;
}

const log: LogEntry[] = [];

export function addLogEntry(entry: LogEntry): void {
  log.push(entry);
}

export function getLogEntries(): LogEntry[] {
  return [...log];
}

export function clearLog(): void {
  log.length = 0;
}
