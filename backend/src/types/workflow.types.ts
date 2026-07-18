export type WorkflowAgentType = "Sequential" | "Semi-sequential" | "Free";

export interface WorkflowNodeData {
  label: string;
  agentType: WorkflowAgentType;
  llm: string;
  knowledge: "none" | "faiss" | "graphrag";
  mcp: "none" | "credit" | "legal";
  systemPrompt?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
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
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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

/**
 * Wire protocol for a custom workflow run (NDJSON, one event per line) — deliberately
 * separate from the retail-credit pipeline's `OrchestrationStreamEvent`/`AgentTrace` so
 * the audited schema stays untouched by this additive, user-composed engine.
 */
export type WorkflowRunEvent =
  | { type: "node_start"; nodeId: string; label: string }
  | { type: "node_done"; nodeId: string; output: WorkflowRunNodeOutput }
  | { type: "node_error"; nodeId: string; message: string }
  | { type: "final"; summary: string }
  | { type: "error"; message: string };
