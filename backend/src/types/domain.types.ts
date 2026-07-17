import { AgentTask } from "./agent.types";
import { ConditionPrecedent, DecisionEnvelope } from "./decision.types";
import { AgentTrace, ToolCallTrace } from "./trace.types";

export type IncomeSourceType = "salary_shb" | "freelance" | "rental";
export type DebtType = "auto_loan" | "credit_card";

export interface IncomeSource {
  id: string;
  type: IncomeSourceType;
  amountMonthly: number;
  currency: "VND";
  source: string;
}

export interface Debt {
  id: string;
  type: DebtType;
  outstandingAmount?: number;
  monthlyPayment?: number;
  creditLimit?: number;
  currency: "VND";
  lender?: string;
}

export interface AutoLoan {
  outstandingAmount: number;
  currentMonthlyPayment: number;
  proposedMonthlyPayment?: number;
  lender: string;
}

export interface RequestedLoan {
  purpose: "future_home_purchase";
  requestedAmount: number;
  requestedTenureYears: number;
  refinanceAutoLoan: AutoLoan;
  insurancePreference: "accepted" | "declined";
}

export interface PropertyInfo {
  type: "future_property";
  purchasePrice: number;
  projectName: string;
  requiresProjectGuarantee: boolean;
  hasProjectGuarantee: boolean;
  acquiredDuringMarriage: boolean;
  spouseSignatureAvailable: boolean;
}

export interface ParsedDocument {
  id: string;
  type: string;
  extractedFields: Record<string, unknown>;
  source: string;
}

export interface ConsentRegistry {
  customerId: string;
  scopes: Record<"credit_check" | "tax_income_check" | "social_insurance_check" | "marketing", boolean>;
  updatedAt: string;
}

export interface CustomerProfileOutput {
  customerId: string;
  demographic: {
    age: number;
    maritalStatus: "single" | "married";
  };
  incomeSources: IncomeSource[];
  currentDebts: Debt[];
  requestedLoan: RequestedLoan;
  property: PropertyInfo;
  documents: ParsedDocument[];
  consent: ConsentRegistry;
  piiMasked: boolean;
  evidence: Record<string, string>;
}

export interface CreditScenario {
  label: "original" | "restructure";
  homeLoanAmount: number;
  tenureYears: number;
  annualStressRate: number;
  homeLoanEmi: number;
  autoLoanMonthlyPayment: number;
  creditCardObligation: number;
  totalMonthlyDebt: number;
  dti: number;
  ltv: number;
  passesDti: boolean;
  passesLtv: boolean;
}

export interface CreditOutput {
  validMonthlyIncome: number;
  currentMonthlyDebt: number;
  originalScenario: CreditScenario;
  restructureScenario: CreditScenario;
  creditDecision: "PASS" | "RESTRUCTURE_REQUIRED" | "FAIL";
  findings: DecisionEnvelope[];
}

export interface ProductOption {
  id: string;
  name: string;
  type: "home_loan" | "auto_refinance";
  maxTenureYears: number;
  maxLtv?: number;
  citations: string[];
}

export interface PricingOffer {
  packageId: string;
  selectedAnnualRate: number;
  preferentialAnnualRate: number;
  fallbackAnnualRate?: number;
  insuranceOptional: boolean;
  conditionedOnInsurance: boolean;
  assumptions: string[];
}

export interface ProductPolicyOutput {
  eligibleProducts: ProductOption[];
  pricingOffer: PricingOffer;
  policyFindings: DecisionEnvelope[];
}

export interface LegalOutput {
  gateStatus: "PASS" | "CONDITIONAL_PASS" | "VIOLATION" | "BLOCKED";
  findings: DecisionEnvelope[];
  requiredFixes: string[];
  conditions: ConditionPrecedent[];
}

export interface DecisionMatrixOutput {
  finalDecision: "FAST_PASS" | "PASS" | "CONDITIONAL_PASS" | "REJECTED" | "HUMAN_ESCALATION";
  vetoedBy?: string;
  reasonCodes: string[];
  conditions: ConditionPrecedent[];
  requiredFixes: string[];
}

export interface OperationsOutput {
  ticketId: string;
  approvalLetterId?: string;
  facilityId?: string;
  executionStatus: "PENDING_APPROVAL" | "PENDING_CONDITIONS" | "EXECUTED" | "BLOCKED";
  toolCalls: ToolCallTrace[];
}

export interface AuditEvent {
  id: string;
  runId: string;
  actor: string;
  actionType: "agent_call" | "tool_call" | "model_call" | "dashboard_output" | "human_approval";
  allowed: boolean;
  ruleIds: string[];
  timestamp: string;
  blockedReason?: string;
}

export interface CostBudgetStatus {
  replayMode: boolean;
  modelCallsUsed: number;
  maxModelCalls: number;
  estimatedCostUsd: number;
}

export interface GovernanceOutput {
  allowed: boolean;
  maskedPayload: Record<string, unknown>;
  auditEvent: AuditEvent;
  budgetStatus: CostBudgetStatus;
  blockedReason?: string;
  findings: DecisionEnvelope[];
}

export interface ModelGatewayRequest {
  runId: string;
  purpose: "final_answer" | "agent_summary";
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  requiredTerms?: string[];
  fallback: string;
}

export interface ModelGatewayResponse {
  content: string;
  model: string;
  provider: "fpt-ai-marketplace";
  usedFallback: boolean;
  error?: string;
  usage?: Record<string, unknown>;
}

export interface WorkflowTemplate {
  workflowId: string;
  tier: "FAST" | "COMPLEX";
  tasks: AgentTask[];
}

export interface LangGraphRunOutput<TOutput> {
  trace: AgentTrace;
  output: TOutput;
}
