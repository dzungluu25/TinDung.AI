import { CustomerProfileOutput } from "../../types/domain.types";
import { RetailCase } from "./retail-case-data";

export const normalizeCustomerProfile = (raw: RetailCase): CustomerProfileOutput => ({
  customerId: raw.customerId,
  demographic: raw.demographic,
  incomeSources: raw.incomeSources,
  currentDebts: raw.currentDebts,
  requestedLoan: raw.requestedLoan,
  property: raw.property,
  documents: raw.documents,
  consent: raw.consent,
  piiMasked: true,
  evidence: {
    demographic: "customer_master_record",
    incomeSources: "parsed_income_documents",
    currentDebts: "credit_bureau_mock",
    requestedLoan: "loan_application_form",
    property: "purchase_contract_draft",
    consent: "digital_consent_form"
  }
});

