import {
  CreditOutput,
  CreditScenario,
  CustomerProfileOutput,
  Debt
} from "../../types/domain.types";
import { DecisionEnvelope } from "../../types/decision.types";
import { calculateEmi } from "../calculators/emi.calculator";
import {
  calculateCurrentMonthlyDebt,
  calculateDebtMonthlyPayment,
  calculateDti,
  calculateIncomeAfterHaircut
} from "../calculators/dti.calculator";
import { calculateLtv } from "../calculators/ltv.calculator";
import { nextId } from "../../utils/ids";

const STRESS_RATE = 0.135;
const DTI_THRESHOLD = 0.6;
const LTV_THRESHOLD = 0.7;

const roundMoney = (value: number): number => Math.round(value);
const roundRatio = (value: number): number => Math.round(value * 10_000) / 10_000;

const creditCardObligation = (debts: Debt[]): number =>
  debts
    .filter((debt) => debt.type === "credit_card")
    .reduce((total, debt) => total + calculateDebtMonthlyPayment(debt), 0);

const buildScenario = (
  profile: CustomerProfileOutput,
  validMonthlyIncome: number,
  label: "original" | "restructure"
): CreditScenario => {
  const requested = profile.requestedLoan;
  const homeLoanAmount = label === "original" ? requested.requestedAmount : 2_250_000_000;
  const tenureYears = label === "original" ? requested.requestedTenureYears : 30;
  const homeLoanEmi = calculateEmi(homeLoanAmount, STRESS_RATE, tenureYears * 12);
  const autoLoanMonthlyPayment =
    label === "original"
      ? requested.refinanceAutoLoan.currentMonthlyPayment
      : requested.refinanceAutoLoan.proposedMonthlyPayment ?? 10_000_000;
  const cardObligation = label === "original" ? creditCardObligation(profile.currentDebts) : 9_500_000;
  const totalMonthlyDebt = homeLoanEmi + autoLoanMonthlyPayment + cardObligation;
  const dti = calculateDti(totalMonthlyDebt, validMonthlyIncome);
  const ltv = calculateLtv(homeLoanAmount, profile.property.purchasePrice);

  return {
    label,
    homeLoanAmount,
    tenureYears,
    annualStressRate: STRESS_RATE,
    homeLoanEmi: roundMoney(homeLoanEmi),
    autoLoanMonthlyPayment: roundMoney(autoLoanMonthlyPayment),
    creditCardObligation: roundMoney(cardObligation),
    totalMonthlyDebt: roundMoney(totalMonthlyDebt),
    dti: roundRatio(dti),
    ltv: roundRatio(ltv),
    passesDti: dti <= DTI_THRESHOLD,
    passesLtv: ltv <= LTV_THRESHOLD
  };
};

export const applyCreditRules = (profile: CustomerProfileOutput, citations: string[]): CreditOutput => {
  const validMonthlyIncome = calculateIncomeAfterHaircut(profile.incomeSources);
  const currentMonthlyDebt = calculateCurrentMonthlyDebt(profile.currentDebts);
  const originalScenario = buildScenario(profile, validMonthlyIncome, "original");
  const restructureScenario = buildScenario(profile, validMonthlyIncome, "restructure");
  const originalPasses = originalScenario.passesDti && originalScenario.passesLtv;
  const restructurePasses = restructureScenario.passesDti && restructureScenario.passesLtv;
  const creditDecision = originalPasses ? "PASS" : restructurePasses ? "RESTRUCTURE_REQUIRED" : "FAIL";

  const findings: DecisionEnvelope[] = [
    {
      decisionId: nextId("decision-credit-income"),
      agent: "credit",
      status: "PASS",
      severity: "INFO",
      blocksAt: "NONE",
      finding: "Valid monthly income calculated after source haircuts.",
      evidence: {
        validMonthlyIncome: roundMoney(validMonthlyIncome),
        salaryWeight: 1,
        freelanceWeight: 0.5,
        rentalWeight: 0.7
      },
      ruleIds: ["CREDIT_VALID_INCOME_CALCULATED"],
      citations
    }
  ];

  if (!originalScenario.passesDti) {
    findings.push({
      decisionId: nextId("decision-credit-dti"),
      agent: "credit",
      status: "FAIL",
      severity: "WARNING",
      blocksAt: "APPROVAL",
      finding: "Original request exceeds DTI stress threshold.",
      evidence: {
        dti: originalScenario.dti,
        threshold: DTI_THRESHOLD
      },
      ruleIds: ["CREDIT_DTI_EXCEEDS_LIMIT"],
      citations,
      requiredFix: "Apply restructure proposal or lower requested amount."
    });
  }

  if (!originalScenario.passesLtv) {
    findings.push({
      decisionId: nextId("decision-credit-ltv"),
      agent: "credit",
      status: "FAIL",
      severity: "WARNING",
      blocksAt: "APPROVAL",
      finding: "Original request exceeds LTV threshold.",
      evidence: {
        ltv: originalScenario.ltv,
        threshold: LTV_THRESHOLD
      },
      ruleIds: ["CREDIT_LTV_EXCEEDS_LIMIT"],
      citations,
      requiredFix: "Reduce home loan amount or increase borrower contribution."
    });
  }

  findings.push({
    decisionId: nextId("decision-credit-restructure"),
    agent: "credit",
    status: restructurePasses ? "CONDITIONAL_PASS" : "FAIL",
    severity: restructurePasses ? "CONDITION" : "BLOCKER",
    blocksAt: restructurePasses ? "CONTRACT_SIGNING" : "APPROVAL",
    finding: restructurePasses
      ? "Restructure scenario passes DTI and LTV thresholds."
      : "Restructure scenario still fails credit thresholds.",
    evidence: {
      homeLoanAmount: restructureScenario.homeLoanAmount,
      tenureYears: restructureScenario.tenureYears,
      dti: restructureScenario.dti,
      ltv: restructureScenario.ltv
    },
    ruleIds: [restructurePasses ? "CREDIT_RESTRUCTURE_PASS" : "CREDIT_RESTRUCTURE_REQUIRED"],
    citations,
    requiredFix: restructurePasses ? undefined : "Request lower loan amount or additional collateral."
  });

  return {
    validMonthlyIncome: roundMoney(validMonthlyIncome),
    currentMonthlyDebt: roundMoney(currentMonthlyDebt),
    originalScenario,
    restructureScenario,
    creditDecision,
    findings
  };
};

