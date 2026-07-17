import { ConditionPrecedent, DecisionEnvelope } from "../../types/decision.types";
import { DecisionMatrixOutput } from "../../types/domain.types";

export const aggregateConditions = (findings: DecisionEnvelope[]): ConditionPrecedent[] =>
  findings
    .filter((finding) => finding.severity === "CONDITION" && finding.blocksAt !== "NONE")
    .map((finding, index) => ({
      id: `matrix-condition-${index + 1}`,
      description: finding.finding,
      blocksAt: finding.blocksAt,
      owner:
        finding.blocksAt === "EXTERNAL_DATA_CALL"
          ? "customer"
          : finding.blocksAt === "DISBURSEMENT"
            ? "third_party"
            : "legal",
      sourceRuleId: finding.ruleIds[0] ?? "MATRIX_CONDITION"
    }));

export const applyDecisionMatrix = (findings: DecisionEnvelope[]): DecisionMatrixOutput => {
  const missingCitation = findings.find((finding) => finding.agent === "legal" && finding.citations.length === 0);
  if (missingCitation) {
    return {
      finalDecision: "HUMAN_ESCALATION",
      vetoedBy: "risk",
      reasonCodes: ["SCHEMA_OR_CITATION_VALIDATION_FAILED"],
      conditions: [],
      requiredFixes: ["Legal finding requires citation before automated decision."]
    };
  }

  const approvalBlocker = findings.find(
    (finding) =>
      finding.blocksAt === "APPROVAL" &&
      (finding.status === "VIOLATION" || finding.severity === "BLOCKER")
  );
  if (approvalBlocker) {
    return {
      finalDecision: "HUMAN_ESCALATION",
      vetoedBy: approvalBlocker.agent,
      reasonCodes: approvalBlocker.ruleIds,
      conditions: [],
      requiredFixes: approvalBlocker.requiredFix ? [approvalBlocker.requiredFix] : []
    };
  }

  const unresolvedCreditFailure = findings.find(
    (finding) => finding.agent === "credit" && finding.status === "FAIL" && finding.severity === "BLOCKER"
  );
  if (unresolvedCreditFailure) {
    return {
      finalDecision: "REJECTED",
      vetoedBy: "credit",
      reasonCodes: unresolvedCreditFailure.ruleIds,
      conditions: [],
      requiredFixes: unresolvedCreditFailure.requiredFix ? [unresolvedCreditFailure.requiredFix] : []
    };
  }

  const conditions = aggregateConditions(findings);
  const reasonCodes = Array.from(new Set(findings.flatMap((finding) => finding.ruleIds)));
  const hasCreditRestructure = findings.some((finding) => finding.ruleIds.includes("CREDIT_RESTRUCTURE_PASS"));

  return {
    finalDecision: conditions.length > 0 || hasCreditRestructure ? "CONDITIONAL_PASS" : "PASS",
    reasonCodes,
    conditions,
    requiredFixes: findings.flatMap((finding) => (finding.requiredFix ? [finding.requiredFix] : []))
  };
};

