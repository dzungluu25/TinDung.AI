import { AgentTask } from "../../types/agent.types";
import { WorkflowTemplate } from "../../types/domain.types";

export const buildDependencyGraph = (template: WorkflowTemplate): AgentTask[] =>
  template.tasks.map((task) => ({ ...task }));

