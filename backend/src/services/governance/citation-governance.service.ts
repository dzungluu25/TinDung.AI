import { DecisionEnvelope } from "../../types/agent.types";
import { AnswerClaim, AnswerTransparency, VerifiedCitation } from "../../types/orchestration.types";
import { AgentTrace } from "../../types/trace.types";
import citationCatalogJson from "../../policy/citation-catalog.json";

export interface CitationCatalog {
  policyVersion: string;
  sources: Record<string, VerifiedCitation>;
  ruleSources: Record<string, string[]>;
  fallbacks: { internalPolicySourceId: string; securitySourceId: string; dataProtectionSourceIds: string[] };
}

const catalog = citationCatalogJson as CitationCatalog;
export const BANKING_AI_POLICY_VERSION = catalog.policyVersion;

const sourcesForRule = (ruleId: string): string[] => {
  if (catalog.ruleSources[ruleId]) return catalog.ruleSources[ruleId];
  if (ruleId.startsWith("CREDIT_") || ruleId.startsWith("PRODUCT_")) return [catalog.fallbacks.internalPolicySourceId];
  return [];
};

const citationLabel = (citation: VerifiedCitation): string => `${citation.documentNumber} - ${citation.locator}`;

interface GroundableFinding {
  ruleIds: string[];
  citations: string[];
  agent: string;
}

/**
 * Generalized version of the legal-only grounding check below: any agent's findings can
 * be forced through the same fail-closed rule-id -> citation-catalog resolution, given
 * its own catalog/agent identity/rule-resolution strategy. `groundLegalFindings` is now a
 * thin wrapper over this so its existing throw-on-unmapped-rule behavior (and the
 * `test-core.ts` assertions against it) are unchanged.
 */
export const groundFindings = <T extends GroundableFinding>(
  findings: T[],
  options: {
    catalog: CitationCatalog;
    agentName: T["agent"];
    resolveRuleId?: (ruleId: string) => string[];
  }
): T[] => {
  const resolveRuleId = options.resolveRuleId ?? ((ruleId: string) => options.catalog.ruleSources[ruleId] ?? []);
  return findings.map(finding => {
    const citationIds = [...new Set(finding.ruleIds.flatMap(resolveRuleId))];
    if (!citationIds.length || citationIds.some(id => !options.catalog.sources[id])) {
      throw new Error(`Citation governance rejected unsupported rule: ${finding.ruleIds.join(", ") || "missing rule"}`);
    }
    return { ...finding, agent: options.agentName, citations: citationIds.map(id => citationLabel(options.catalog.sources[id])) };
  });
};

export const groundLegalFindings = (findings: DecisionEnvelope[]): DecisionEnvelope[] =>
  groundFindings(findings, { catalog, agentName: "legal", resolveRuleId: sourcesForRule });

const allFindings = (traces: AgentTrace[]): DecisionEnvelope[] =>
  traces.flatMap(trace => (trace.findings ?? []) as DecisionEnvelope[]);

export const buildAnswerTransparency = (
  baseAnswer: string,
  traces: AgentTrace[],
  finalDecision: string,
  approvalMode: string,
  reasonCodes: string[] = []
): { finalAnswer: string; transparency: AnswerTransparency } => {
  const findings = allFindings(traces);
  const materialFindings = findings.filter(finding => finding.severity !== "INFO");
  const ruleIds = [...new Set(materialFindings.flatMap(finding => finding.ruleIds))];
  const resolvedRuleIds = ruleIds.filter(ruleId => sourcesForRule(ruleId).length > 0);
  const citationIds = [...new Set(resolvedRuleIds.flatMap(sourcesForRule))];

  if (reasonCodes.some(reason => reason.includes("CONSENT"))) {
    citationIds.push("PERSONAL_DATA_2025", "PERSONAL_DATA_BANKING_2025");
  }

  if (!citationIds.length) {
    citationIds.push(finalDecision === "SECURITY_BLOCKED" ? catalog.fallbacks.securitySourceId : catalog.fallbacks.internalPolicySourceId);
  }
  const decisionCitationIdSet = new Set(citationIds);
  citationIds.push(...catalog.fallbacks.dataProtectionSourceIds);

  const citations = [...new Set(citationIds)].map(id => catalog.sources[id]).filter((source): source is VerifiedCitation => Boolean(source));
  const citationMarkers = citations
    .filter(citation => decisionCitationIdSet.has(citation.id))
    .map(citation => `[${citations.indexOf(citation) + 1}]`)
    .join(" ");

  const failedMandatoryAgent = traces.some(trace => trace.status === "failed");
  const hasInternalSource = citations.some(citation => citation.verificationStatus === "INTERNAL_REVIEW_REQUIRED");
  const evidenceCoveragePercent = ruleIds.length ? Math.round((resolvedRuleIds.length / ruleIds.length) * 100) : 100;
  const requiresHumanReview = approvalMode !== "AUTO_APPROVAL" || failedMandatoryAgent || evidenceCoveragePercent < 100;
  const confidence: AnswerTransparency["confidence"] = failedMandatoryAgent || evidenceCoveragePercent < 100
    ? "LOW"
    : hasInternalSource || requiresHumanReview ? "MEDIUM" : "HIGH";

  const decisionTraceIds = traces.filter(trace => ["credit", "product", "legal", "risk"].includes(trace.agent)).map(trace => trace.id);
  const decisionCitationIds = citations.filter(citation => decisionCitationIdSet.has(citation.id)).map(citation => citation.id);
  const claims: AnswerClaim[] = [
    { claimId: "final-decision", kind: "DECISION", text: `Kết luận điều phối: ${finalDecision}.`, citationIds: decisionCitationIds, traceIds: decisionTraceIds },
    { claimId: "data-governance", kind: "FACT", text: "Luồng xử lý áp dụng che dữ liệu cá nhân và ghi nhật ký kiểm toán.", citationIds: catalog.fallbacks.dataProtectionSourceIds, traceIds: traces.map(trace => trace.id) },
  ];

  const limitations = ["Kết quả là hỗ trợ quyết định; không thay thế phê duyệt của người có thẩm quyền khi approvalMode không phải AUTO_APPROVAL."];
  if (hasInternalSource) limitations.push("Policy demo nội bộ phải được chủ sở hữu chính sách xác nhận phiên bản và hiệu lực trước khi vận hành thật.");
  if (evidenceCoveragePercent < 100) limitations.push(`Có ${ruleIds.length - resolvedRuleIds.length} rule ID chưa ánh xạ được tới nguồn; hệ thống yêu cầu soát xét.`);

  return {
    finalAnswer: citationMarkers ? `${baseAnswer} ${citationMarkers}` : baseAnswer,
    transparency: {
      generatedAt: new Date().toISOString(), confidence, evidenceCoveragePercent, requiresHumanReview,
      policyVersion: BANKING_AI_POLICY_VERSION, claims, citations, limitations,
    },
  };
};

export const getCitationCatalog = (): VerifiedCitation[] => Object.values(catalog.sources);
