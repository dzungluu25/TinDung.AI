import { AgentRole } from "../../types/agent.types";
import { GuardResult } from "./consent-guard.service";

const TOOL_PERMISSIONS: Record<AgentRole, string[]> = {
  planner: ["retrieveWorkflowTemplate", "loadCaseData", "saveOrchestrationRun", "appendAuditEvent"],
  "customer-profile": ["loadCustomerProfile", "loadParsedDocuments", "loadConsentRegistry", "queryMockKnowledgeBase"],
  credit: ["queryMockKnowledgeBase", "calculateEmi", "applyCreditRules", "loadCreditPolicy"],
  "product-policy": ["queryMockKnowledgeBase", "buildPricingOffer", "validateProductEligibility"],
  legal: ["queryMockKnowledgeBase", "applyLegalRulePack", "checkConsentScope", "validateCitationPresence"],
  risk: ["queryMockKnowledgeBase", "validateAgentOutput", "applyDecisionMatrix", "appendDecisionAudit"],
  operations: [
    "queryMockKnowledgeBase",
    "createApprovalTicket",
    "createApprovalLetter",
    "createLosApprovalRecord",
    "createPendingFacility",
    "setConditionPrecedents",
    "notifyCustomer",
    "appendAuditLog"
  ],
  governance: ["queryMockKnowledgeBase", "guardToolCall", "guardModelCall", "maskDashboardPayload", "appendAuditEvent"]
};

export const assertToolPermission = (agent: AgentRole, toolName: string): GuardResult => {
  const allowed = TOOL_PERMISSIONS[agent]?.includes(toolName) ?? false;
  return {
    allowed,
    ruleIds: ["GOV_TOOL_RBAC"],
    reason: allowed ? undefined : `${agent} is not permitted to call ${toolName}`
  };
};

export const assertSideEffectAllowed = (toolName: string, approvalToken?: string): GuardResult => {
  const highSideEffectTools = new Set(["createApprovalLetter", "createLosApprovalRecord", "createPendingFacility"]);
  const requiresToken = highSideEffectTools.has(toolName);
  const allowed = !requiresToken || Boolean(approvalToken);

  return {
    allowed,
    ruleIds: ["GOV_HIGH_SIDE_EFFECT_APPROVAL"],
    reason: allowed ? undefined : `${toolName} requires a human approval token`
  };
};

