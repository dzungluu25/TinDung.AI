import {
  ConsentRegistry,
  Debt,
  IncomeSource,
  ParsedDocument,
  PropertyInfo,
  RequestedLoan
} from "../../types/domain.types";

export interface RetailCase {
  caseId: string;
  customerId: string;
  customerName: string;
  pii: {
    cccd: string;
    phone: string;
    email: string;
    address: string;
    accountNumber: string;
    cicCode: string;
  };
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
}

const MAIN_CASE: RetailCase = {
  caseId: "CASE-MAIN",
  customerId: "CUST-HUNG-001",
  customerName: "Nguyen Van Hung",
  pii: {
    cccd: "079089001234",
    phone: "+84901234567",
    email: "hung.nguyen@example.com",
    address: "123 Nguyen Trai, Thanh Xuan, Ha Noi",
    accountNumber: "9704001234567890",
    cicCode: "CIC-HUNG-2026"
  },
  demographic: {
    age: 34,
    maritalStatus: "married"
  },
  incomeSources: [
    {
      id: "income-salary-shb",
      type: "salary_shb",
      amountMonthly: 55_000_000,
      currency: "VND",
      source: "salary_statement_6m"
    },
    {
      id: "income-freelance",
      type: "freelance",
      amountMonthly: 25_000_000,
      currency: "VND",
      source: "freelance_contracts"
    },
    {
      id: "income-rental",
      type: "rental",
      amountMonthly: 12_000_000,
      currency: "VND",
      source: "rental_agreement"
    }
  ],
  currentDebts: [
    {
      id: "debt-auto-loan",
      type: "auto_loan",
      outstandingAmount: 450_000_000,
      monthlyPayment: 14_750_000,
      currency: "VND",
      lender: "External Auto Finance"
    },
    {
      id: "debt-credit-card",
      type: "credit_card",
      creditLimit: 200_000_000,
      currency: "VND",
      lender: "SHB"
    }
  ],
  requestedLoan: {
    purpose: "future_home_purchase",
    requestedAmount: 2_800_000_000,
    requestedTenureYears: 25,
    refinanceAutoLoan: {
      outstandingAmount: 450_000_000,
      currentMonthlyPayment: 14_750_000,
      proposedMonthlyPayment: 10_000_000,
      lender: "External Auto Finance"
    },
    insurancePreference: "declined"
  },
  property: {
    type: "future_property",
    purchasePrice: 3_500_000_000,
    projectName: "Future Residence Tower A",
    requiresProjectGuarantee: true,
    hasProjectGuarantee: false,
    acquiredDuringMarriage: true,
    spouseSignatureAvailable: false
  },
  documents: [
    {
      id: "doc-cic-consent",
      type: "consent_registry",
      source: "digital_consent_form",
      extractedFields: {
        credit_check: true,
        tax_income_check: false,
        social_insurance_check: false,
        marketing: false
      }
    },
    {
      id: "doc-income",
      type: "income_bundle",
      source: "parsed_income_documents",
      extractedFields: {
        salaryMonthly: 55_000_000,
        freelanceMonthly: 25_000_000,
        rentalMonthly: 12_000_000
      }
    },
    {
      id: "doc-property",
      type: "property_purchase",
      source: "purchase_contract_draft",
      extractedFields: {
        projectName: "Future Residence Tower A",
        purchasePrice: 3_500_000_000,
        guaranteeProvided: false
      }
    }
  ],
  consent: {
    customerId: "CUST-HUNG-001",
    scopes: {
      credit_check: true,
      tax_income_check: false,
      social_insurance_check: false,
      marketing: false
    },
    updatedAt: "2026-07-17T00:00:00.000Z"
  }
};

const FAST_CASE: RetailCase = {
  ...MAIN_CASE,
  caseId: "CASE-FAST",
  customerId: "CUST-FAST-001",
  customerName: "Demo Fast Customer",
  demographic: {
    age: 31,
    maritalStatus: "single"
  },
  currentDebts: [],
  requestedLoan: {
    ...MAIN_CASE.requestedLoan,
    requestedAmount: 300_000_000,
    requestedTenureYears: 5,
    insurancePreference: "declined"
  },
  property: {
    ...MAIN_CASE.property,
    type: "future_property",
    purchasePrice: 800_000_000,
    requiresProjectGuarantee: false,
    hasProjectGuarantee: true,
    acquiredDuringMarriage: false,
    spouseSignatureAvailable: false
  },
  consent: {
    customerId: "CUST-FAST-001",
    scopes: {
      credit_check: true,
      tax_income_check: true,
      social_insurance_check: true,
      marketing: false
    },
    updatedAt: "2026-07-17T00:00:00.000Z"
  }
};

const CASES: Record<string, RetailCase> = {
  [MAIN_CASE.caseId]: MAIN_CASE,
  [FAST_CASE.caseId]: FAST_CASE
};

export const inferCaseIdFromPrompt = (prompt: string, explicitCaseId?: string): string => {
  if (explicitCaseId && CASES[explicitCaseId]) {
    return explicitCaseId;
  }

  const normalized = prompt.toLowerCase();
  if (normalized.includes("fast") || normalized.includes("simple") || normalized.includes("clean")) {
    return "CASE-FAST";
  }

  return "CASE-MAIN";
};

export const loadRetailCase = async (caseId: string): Promise<RetailCase> => {
  const retailCase = CASES[caseId];
  if (!retailCase) {
    throw new Error(`Retail case "${caseId}" was not found.`);
  }
  return retailCase;
};
