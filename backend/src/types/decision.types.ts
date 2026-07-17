export type FindingSeverity = "INFO" | "CONDITION" | "WARNING" | "BLOCKER";

export type BlocksAt =
  | "APPROVAL"
  | "CONTRACT_SIGNING"
  | "DISBURSEMENT"
  | "EXTERNAL_DATA_CALL"
  | "NONE";

export type DecisionStatus = "PASS" | "CONDITIONAL_PASS" | "VIOLATION" | "BLOCKED" | "FAIL";

export interface DecisionEnvelope {
  decisionId: string;
  agent: string;
  status: DecisionStatus;
  severity: FindingSeverity;
  blocksAt: BlocksAt;
  finding: string;
  evidence: Record<string, unknown>;
  ruleIds: string[];
  citations: string[];
  requiredFix?: string;
}

export interface ConditionPrecedent {
  id: string;
  description: string;
  blocksAt: BlocksAt;
  owner: "customer" | "bank" | "third_party" | "legal" | "operations";
  sourceRuleId: string;
}

