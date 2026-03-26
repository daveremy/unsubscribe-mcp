import type { ToolResponse } from "../types.js";

export function textResult(text: string): ToolResponse {
  return { content: [{ type: "text" as const, text }] };
}

export function errorTextResult(text: string): ToolResponse {
  return { content: [{ type: "text" as const, text }], isError: true };
}
