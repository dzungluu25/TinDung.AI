import {
  ConsentRegistry,
  CustomerProfileOutput,
  LegalOutput,
  PricingOffer,
  ProductPolicyOutput
} from "../../types/domain.types";
import { ConditionPrecedent, DecisionEnvelope } from "../../types/decision.types";
import { nextId } from "../../utils/ids";
import { assertConsent } from "../governance/consent-guard.service";

export const checkInsuranceTying = (pricingOffer: PricingOffer, citations: string[]): DecisionEnvelope => {
  const violation = pricingOffer.conditionedOnInsurance;
  return {
    decisionId: nextId("decision-legal-insurance"),
    agent: "legal",
    status: violation ? "VIOLATION" : "PASS",
    severity: violation ? "BLOCKER" : "INFO",
    blocksAt: violation ? "APPROVAL" : "NONE",
    finding: violation
      ? "Preferential pricing is conditioned on optional insurance purchase."
      : "Preferential pricing does not depend on optional insurance purchase.",
    evidence: {
      packageId: pricingOffer.packageId,
      conditionedOnInsurance: pricingOffer.conditionedOnInsurance,
      assumptions: pricingOffer.assumptions
    },
    ruleIds: ["LEGAL_INSURANCE_TYING_PROHIBITED"],
    citations,
    requiredFix: violation ? "Remove insurance_purchase from pricing function and re-price." : undefined
  };
};

export const checkMaritalProperty = (profile: CustomerProfileOutput, citations: string[]): DecisionEnvelope => {
  const requiresCondition =
    profile.demographic.maritalStatus === "married" &&
    profile.property.acquiredDuringMarriage &&
    !profile.property.spouseSignatureAvailable;

  return {
    decisionId: nextId("decision-legal-marital"),
    agent: "legal",
    status: requiresCondition ? "CONDITIONAL_PASS" : "PASS",
    severity: requiresCondition ? "CONDITION" : "INFO",
    blocksAt: requiresCondition ? "CONTRACT_SIGNING" : "NONE",
    finding: requiresCondition
      ? "Spouse signature or separate-property proof is required before mortgage contract signing."
      : "No marital property signing condition detected.",
    evidence: {
      maritalStatus: profile.demographic.maritalStatus,
      acquiredDuringMarriage: profile.property.acquiredDuringMarriage,
      spouseSignatureAvailable: profile.property.spouseSignatureAvailable
    },
    ruleIds: ["LEGAL_MARITAL_PROPERTY_SIGNATURE"],
    citations
  };
};

export const checkFuturePropertyProject = (profile: CustomerProfileOutput, citations: string[]): DecisionEnvelope => {
  const requiresCondition = profile.property.requiresProjectGuarantee && !profile.property.hasProjectGuarantee;

  return {
    decisionId: nextId("decision-legal-project"),
    agent: "legal",
    status: requiresCondition ? "CONDITIONAL_PASS" : "PASS",
    severity: requiresCondition ? "CONDITION" : "INFO",
    blocksAt: requiresCondition ? "DISBURSEMENT" : "NONE",
    finding: requiresCondition
      ? "Project guarantee or lien release document is required before disbursement."
      : "Future-property project condition is satisfied.",
    evidence: {
      projectName: profile.property.projectName,
      requiresProjectGuarantee: profile.property.requiresProjectGuarantee,
      hasProjectGuarantee: profile.property.hasProjectGuarantee
    },
    ruleIds: ["LEGAL_FUTURE_PROPERTY_PROJECT_GUARANTEE"],
    citations
  };
};

export const checkConsentBeforeExternalCall = (
  consent: ConsentRegistry,
  scope: keyof ConsentRegistry["scopes"],
  citations: string[]
): DecisionEnvelope => {
  const guard = assertConsent(scope, consent);
  return {
    decisionId: nextId("decision-legal-consent"),
    agent: "legal",
    status: guard.allowed ? "PASS" : "BLOCKED",
    severity: guard.allowed ? "INFO" : "CONDITION",
    blocksAt: guard.allowed ? "NONE" : "EXTERNAL_DATA_CALL",
    finding: guard.allowed
      ? `Consent scope ${scope} is present.`
      : `External ${scope} verification is blocked until separate consent is collected.`,
    evidence: {
      scope,
      allowed: guard.allowed
    },
    ruleIds: guard.ruleIds,
    citations,
    requiredFix: guard.allowed ? undefined : `Obtain separate consent for ${scope}.`
  };
};

export const buildLegalOutput = (
  profile: CustomerProfileOutput,
  productOutput: ProductPolicyOutput,
  citations: string[]
): LegalOutput => {
  const findings = [
    checkInsuranceTying(productOutput.pricingOffer, citations),
    checkMaritalProperty(profile, citations),
    checkFuturePropertyProject(profile, citations),
    checkConsentBeforeExternalCall(profile.consent, "tax_income_check", citations),
    checkConsentBeforeExternalCall(profile.consent, "social_insurance_check", citations)
  ];

  const approvalViolation = findings.some(
    (finding) => finding.status === "VIOLATION" && finding.blocksAt === "APPROVAL"
  );
  const blockingExternalOnly = findings.some((finding) => finding.status === "BLOCKED");
  const hasConditions = findings.some((finding) => finding.severity === "CONDITION");
  const gateStatus = approvalViolation
    ? "VIOLATION"
    : blockingExternalOnly || hasConditions
      ? "CONDITIONAL_PASS"
      : "PASS";

  const conditions: ConditionPrecedent[] = findings
    .filter((finding) => finding.severity === "CONDITION")
    .map((finding) => ({
      id: nextId("condition"),
      description: finding.finding,
      blocksAt: finding.blocksAt,
      owner:
        finding.blocksAt === "EXTERNAL_DATA_CALL"
          ? "customer"
          : finding.blocksAt === "DISBURSEMENT"
            ? "third_party"
            : "legal",
      sourceRuleId: finding.ruleIds[0] ?? "LEGAL_CONDITION"
    }));

  return {
    gateStatus,
    findings,
    requiredFixes: findings.flatMap((finding) => (finding.requiredFix ? [finding.requiredFix] : [])),
    conditions
  };
};

