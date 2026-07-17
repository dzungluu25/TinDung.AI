import { AgentTrace } from "./trace.types";

export interface OrchestrationRequest {
  prompt: string;
  caseId?: string;
  customerId?: string;
  approvalToken?: string;
}

export interface OrchestrationResponse {
  runId: string;
  tier?: "FAST" | "COMPLEX";
  workflowId?: string;
  finalAnswer: string;
  traces: AgentTrace[];
  approvalTicketId?: string;
}
