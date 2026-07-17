import { Debt, IncomeSource } from "../../types/domain.types";

const INCOME_WEIGHT: Record<IncomeSource["type"], number> = {
  salary_shb: 1,
  freelance: 0.5,
  rental: 0.7
};

export const calculateIncomeAfterHaircut = (incomeSources: IncomeSource[]): number =>
  incomeSources.reduce((total, source) => total + source.amountMonthly * INCOME_WEIGHT[source.type], 0);

export const calculateDebtMonthlyPayment = (debt: Debt): number => {
  if (debt.type === "credit_card") {
    return (debt.creditLimit ?? 0) * 0.05;
  }

  return debt.monthlyPayment ?? 0;
};

export const calculateCurrentMonthlyDebt = (debts: Debt[]): number =>
  debts.reduce((total, debt) => total + calculateDebtMonthlyPayment(debt), 0);

export const calculateDti = (totalMonthlyDebt: number, validIncome: number): number => {
  if (validIncome <= 0) {
    throw new Error("Valid monthly income must be greater than zero.");
  }
  return totalMonthlyDebt / validIncome;
};

