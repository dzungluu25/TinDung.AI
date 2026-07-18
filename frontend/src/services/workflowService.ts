import { apiFetch, apiFetchStream } from "./httpClient";
import type { ModelRegistryEntry, WorkflowDefinition, WorkflowEdgeDto, WorkflowNodeDto, WorkflowRunEvent, WorkflowSettings } from "../types/workflow";

export const getModelRegistry = (token: string): Promise<{ models: ModelRegistryEntry[] }> =>
  apiFetch("/api/workflows/model-registry", { token });

export const listWorkflows = (token: string): Promise<{ workflows: WorkflowDefinition[] }> =>
  apiFetch("/api/workflows", { token });

export const getWorkflow = (id: string, token: string): Promise<WorkflowDefinition> =>
  apiFetch(`/api/workflows/${id}`, { token });

export const createWorkflow = (
  payload: { name: string; nodes: WorkflowNodeDto[]; edges: WorkflowEdgeDto[]; settings: WorkflowSettings },
  token: string
): Promise<WorkflowDefinition> => apiFetch("/api/workflows", { method: "POST", body: payload, token });

export const updateWorkflow = (
  id: string,
  payload: Partial<{ name: string; nodes: WorkflowNodeDto[]; edges: WorkflowEdgeDto[]; settings: WorkflowSettings }>,
  token: string
): Promise<WorkflowDefinition> => apiFetch(`/api/workflows/${id}`, { method: "PUT", body: payload, token });

export const deleteWorkflow = (id: string, token: string): Promise<void> =>
  apiFetch(`/api/workflows/${id}`, { method: "DELETE", token });

/** Same NDJSON-reading technique as orchestrationService.ts's streamOrchestration — a
 * separate function because the event shape (`WorkflowRunEvent`) is its own, deliberately
 * not reusing the retail-credit pipeline's `OrchestrationStreamEvent`. */
export const streamWorkflowRun = async (
  workflowId: string,
  input: string,
  token: string,
  onEvent: (event: WorkflowRunEvent) => void,
  signal?: AbortSignal
): Promise<void> => {
  const response = await apiFetchStream(`/api/workflows/${workflowId}/run/stream`, { input }, token);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emitLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    onEvent(JSON.parse(trimmed) as WorkflowRunEvent);
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
      buffer = lines.pop() ?? "";
      for (const line of lines) emitLine(line);
    }
  } finally {
    buffer += decoder.decode();
    emitLine(buffer);
  }
};
