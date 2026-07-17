export type AgentRole =
  | "planner"
  | "customer-profile"
  | "credit"
  | "product-policy"
  | "legal"
  | "risk"
  | "operations"
  | "governance";

export interface AgentTask {
  id: string;
  role: AgentRole;
  description: string;
  status: "pending" | "running" | "completed" | "blocked" | "failed";
}
