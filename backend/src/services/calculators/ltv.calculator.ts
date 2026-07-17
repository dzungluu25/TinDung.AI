export const calculateLtv = (loanAmount: number, propertyValue: number): number => {
  if (propertyValue <= 0) {
    throw new Error("Property value must be greater than zero.");
  }
  return loanAmount / propertyValue;
};

