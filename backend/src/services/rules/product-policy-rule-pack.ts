import { CustomerProfileOutput, ProductOption, ProductPolicyOutput } from "../../types/domain.types";
import { DecisionEnvelope } from "../../types/decision.types";
import { nextId } from "../../utils/ids";

export const matchEligibleProducts = (profile: CustomerProfileOutput, citations: string[]): ProductOption[] => [
  {
    id: "HOME-FUTURE-30Y",
    name: "Future Home Mortgage",
    type: "home_loan",
    maxTenureYears: 30,
    maxLtv: 0.7,
    citations
  },
  {
    id: "AUTO-REFI-SHB",
    name: "SHB Auto Loan Refinance",
    type: "auto_refinance",
    maxTenureYears: 7,
    citations
  }
];

export const buildProductPolicyOutput = (
  profile: CustomerProfileOutput,
  citations: string[],
  repriceRequested: boolean
): ProductPolicyOutput => {
  const eligibleProducts = matchEligibleProducts(profile, citations);
  const conditionedOnInsurance = !repriceRequested;
  const pricingOffer = {
    packageId: repriceRequested ? "PRICING-REPRICED-OPTIONAL-INSURANCE" : "PRICING-TRAP-INSURANCE",
    selectedAnnualRate: repriceRequested ? 0.075 : 0.083,
    preferentialAnnualRate: 0.075,
    fallbackAnnualRate: repriceRequested ? undefined : 0.083,
    insuranceOptional: repriceRequested,
    conditionedOnInsurance,
    assumptions: repriceRequested
      ? ["Preferential rate is available for eligible customers regardless of optional insurance preference."]
      : ["7.5% preferential rate only if optional insurance is purchased.", "8.3% otherwise."]
  };

  const policyFindings: DecisionEnvelope[] = [
    {
      decisionId: nextId("decision-product"),
      agent: "product-policy",
      status: conditionedOnInsurance ? "CONDITIONAL_PASS" : "PASS",
      severity: conditionedOnInsurance ? "WARNING" : "INFO",
      blocksAt: conditionedOnInsurance ? "APPROVAL" : "NONE",
      finding: conditionedOnInsurance
        ? "Initial pricing offer contains an insurance-linked preferential rate assumption."
        : "Re-priced offer removes optional insurance from rate eligibility.",
      evidence: {
        packageId: pricingOffer.packageId,
        selectedAnnualRate: pricingOffer.selectedAnnualRate,
        conditionedOnInsurance
      },
      ruleIds: conditionedOnInsurance ? ["PRODUCT_INSURANCE_PRICING_TRAP"] : ["PRODUCT_REPRICED_INSURANCE_OPTIONAL"],
      citations,
      requiredFix: conditionedOnInsurance ? "Submit offer to Legal for veto/re-price check." : undefined
    }
  ];

  return {
    eligibleProducts,
    pricingOffer,
    policyFindings
  };
};

