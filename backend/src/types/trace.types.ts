import { AgentRole } from "./agent.types";

export interface ToolCallTrace {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: "success" | "failed";
}

export interface AgentTrace {
  id: string;
  runId: string;
  agent: AgentRole;
  task: string;
  status: "pending" | "running" | "completed" | "blocked" | "failed";
  summary: string;
  toolCalls: ToolCallTrace[];
  output?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
}
