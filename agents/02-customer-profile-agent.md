# Customer Profile Agent

## Vai tro

Customer Profile Agent lay va chuan hoa ho so khach hang. Agent nay cung cap du lieu dau vao cho Credit, Legal, Product va Risk.

Agent nay khong ra quyet dinh approve/reject. No chi thu thap, normalize, mask va gan evidence cho du lieu.

## Flow

```text
Receive caseId/customerId
-> Load customer profile mock
-> Load parsed documents
-> Load current debts and income sources
-> Load consent registry
-> Normalize fields
-> Classify sensitive data
-> Return profile bundle
```

## Input

```ts
type CustomerProfileInput = {
  runId: string;
  caseId: string;
  customerId: string;
};
```

## Output

```ts
type CustomerProfileOutput = {
  customerId: string;
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
};
```

## Knowledge base can co

- Mapping field tu parsed document sang domain object.
- Data classification: public, internal, confidential, restricted PII.
- Consent scopes: credit_check, tax_income_check, social_insurance_check, marketing.
- Document checklist cho retail mortgage.

## Cach code

File de xuat:

```text
backend/src/services/agents/customer-profile.agent.ts
backend/src/services/data/retail-case-data.ts
backend/src/services/data/document-normalizer.ts
backend/src/services/governance/data-classification.service.ts
```

Function goi y:

```ts
loadRetailCase(caseId: string): RetailCase;
normalizeCustomerProfile(raw: RetailCase): CustomerProfileOutput;
classifyProfileFields(profile: CustomerProfileOutput): ClassifiedPayload;
runCustomerProfileAgent(runId: string, caseId: string): Promise<AgentTrace>;
```

## Knowledge data mau

Case chinh:

```text
Customer: Nguyen Van Hung, 34 tuoi, married
Home purchase price: 3.5B VND
Requested home loan: 2.8B VND
Requested tenure: 25 years
Auto loan refinance: 450M VND remaining
Salary via SHB: 55M/month
Freelance income: 25M/month
Rental income: 12M/month
Credit card limit: 200M VND
Insurance preference: declined
```

## Way handle

- Khong gui raw CCCD, account number, phone, email vao model prompt.
- Neu document bi thieu field, return `requires_more_info`.
- Neu consent scope khong co, set flag cho Legal/Governance.
- Moi field quan trong nen co source/evidence.

## Tool calls

- `loadCustomerProfile`
- `loadParsedDocuments`
- `loadConsentRegistry`

## Acceptance criteria

- Tra ve profile du cho Credit tinh income/debt.
- Tra ve consent du cho Legal/Governance chan external call.
- Dashboard co the hien thi profile da mask.
- Khong agent nao can hardcode lai case data.

