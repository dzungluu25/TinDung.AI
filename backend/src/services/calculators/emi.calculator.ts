export const calculateEmi = (principal: number, annualRate: number, months: number): number => {
  if (principal <= 0 || annualRate < 0 || months <= 0) {
    throw new Error("Invalid EMI inputs.");
  }

  const monthlyRate = annualRate / 12;
  if (monthlyRate === 0) {
    return principal / months;
  }

  const compound = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * compound) / (compound - 1);
};

