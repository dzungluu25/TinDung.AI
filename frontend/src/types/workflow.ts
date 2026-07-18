// Mirrors backend/src/types/workflow.types.ts — the wire contract for the additive,
// user-composed "workflow designer" engine (separate from types/api.ts, which is the
// retail-credit pipeline's audited schema).

export type WorkflowAgentType = "Sequential" | "Semi-sequential" | "Free";

export interface WorkflowNodeData {
  label: string;
  agentType: WorkflowAgentType;
  llm: string;
  knowledge: "none" | "faiss" | "graphrag";
  mcp: "none" | "credit" | "legal";
  systemPrompt?: string;
}

export interface WorkflowNodeDto {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdgeDto {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  data?: { branchValue?: string };
}

export interface WorkflowSettings {
  temperature: number;
  maxTokens: number;
  hardnessEnabled: boolean;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNodeDto[];
  edges: WorkflowEdgeDto[];
  settings: WorkflowSettings;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelRegistryEntry {
  id: string;
  label: string;
  configured: boolean;
}

export type WorkflowRunNodeStatus = "success" | "needs_review" | "failed";

export interface WorkflowRunNodeOutput {
  nodeId: string;
  label: string;
  status: WorkflowRunNodeStatus;
  text: string;
  branch?: string | null;
  citationIds: string[];
  toolCalls: Array<{ toolName: string; input: Record<string, unknown>; output: Record<string, unknown>; status: "success" | "failed" }>;
  reasons?: string[];
}

export type WorkflowRunEvent =
  | { type: "node_start"; nodeId: string; label: string }
  | { type: "node_done"; nodeId: string; output: WorkflowRunNodeOutput }
  | { type: "node_error"; nodeId: string; message: string }
  | { type: "final"; summary: string }
  | { type: "error"; message: string };
