import { AgentRole } from "../../types/agent.types";
import { AgentTrace, ToolCallTrace } from "../../types/trace.types";
import { nextId } from "../../utils/ids";

export const buildAgentTrace = (
  runId: string,
  agent: AgentRole,
  task: string,
  summary: string,
  startedAt: string,
  toolCalls: ToolCallTrace[],
  output?: Record<string, unknown>,
  status: AgentTrace["status"] = "completed"
): AgentTrace => ({
  id: nextId(`trace-${agent}`),
  runId,
  agent,
  task,
  status,
  summary,
  toolCalls,
  output,
  startedAt,
  completedAt: new Date().toISOString()
});

