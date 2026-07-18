import { apiFetch, apiFetchStream } from "./httpClient";
import type { OrchestrationResponse, OrchestrationStreamEvent } from "../types/api";

/**
 * Consumes the backend's real NDJSON stream (one OrchestrationStreamEvent per line) from
 * the Express/LangGraph backend's `POST /api/orchestrate/stream` and invokes onEvent as
 * each line arrives off the network — no artificial delay, no separate mock backend.
 * Not SSE/EventSource because this is a POST carrying an Authorization header, which
 * EventSource cannot send.
 */
export const streamOrchestration = async (
  prompt: string,
  token: string,
  approvalToken: string | undefined,
  onEvent: (event: OrchestrationStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> => {
  const response = await apiFetchStream("/api/orchestrate/stream", { prompt, approvalToken }, token);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emitLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    onEvent(JSON.parse(trimmed) as OrchestrationStreamEvent);
  };

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // The last entry may be a partial line still being written by the server —
      // keep it in the buffer until the next chunk completes it.
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        emitLine(line);
      }
    }
  } finally {
    buffer += decoder.decode();
    emitLine(buffer);
  }
};

export const getRunTraces = (runId: string, token: string): Promise<OrchestrationResponse> =>
  apiFetch<OrchestrationResponse>(`/api/orchestrate/${runId}/traces`, { token });
