export const checkCreditScore = async (customerId: string): Promise<Record<string, unknown>> => {
  return {
    customerId,
    creditScore: 720,
    status: "APPROVED_FOR_CHECK"
  };
};
