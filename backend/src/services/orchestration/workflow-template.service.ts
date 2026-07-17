import { AgentTask } from "../../types/agent.types";
import { WorkflowTemplate } from "../../types/domain.types";

const makeTask = (id: string, role: AgentTask["role"], description: string): AgentTask => ({
  id,
  role,
  description,
  status: "pending"
});

export const retrieveWorkflowTemplate = (tier: "FAST" | "COMPLEX"): WorkflowTemplate => {
  if (tier === "FAST") {
    return {
      workflowId: "WF-FAST-POLICY-RAG",
      tier,
      tasks: [
        makeTask("task-router", "planner", "Classify request as FAST and retrieve direct policy response"),
        makeTask("task-governance", "governance", "Mask and audit FAST response")
      ]
    };
  }

  return {
    workflowId: "WF-RETAIL-MORTGAGE-REFI",
    tier,
    tasks: [
      makeTask("task-router", "planner", "Classify complex retail mortgage/refinance request"),
      makeTask("task-profile", "customer-profile", "Load and normalize customer profile"),
      makeTask("task-product", "product-policy", "Retrieve product policy and pricing options"),
      makeTask("task-credit", "credit", "Calculate credit affordability and restructure scenario"),
      makeTask("task-legal", "legal", "Apply compliance veto and conditions"),
      makeTask("task-risk", "risk", "Aggregate decisions and apply veto priority"),
      makeTask("task-ops", "operations", "Execute guarded mock operations tools"),
      makeTask("task-governance", "governance", "Mask dashboard output and append audit")
    ]
  };
};

