# Credit Assessment Agent

## Vai tro

Credit Assessment Agent phu trach toan bo tinh toan tin dung. Moi cong thuc phai deterministic, khong dung LLM de tinh so.

Agent nay dua ra credit findings va restructure proposal, nhung khong duoc tu approve cuoi cung.

## Flow

```text
Receive customer profile
-> Apply income haircut
-> Calculate existing monthly debt
-> Calculate requested home loan EMI
-> Calculate DTI stress and LTV
-> Detect fail against credit rules
-> Build restructure proposal
-> Recalculate DTI/LTV
-> Return structured credit findings
```

## Input

```ts
type CreditInput = {
  runId: string;
  incomeSources: IncomeSource[];
  currentDebts: Debt[];
  requestedHomeLoanAmount: number;
  propertyValue: number;
  tenureYears: number;
  refinanceAutoLoan: AutoLoan;
};
```

## Output

```ts
type CreditOutput = {
  validMonthlyIncome: number;
  currentMonthlyDebt: number;
  originalScenario: CreditScenario;
  restructureScenario: CreditScenario;
  creditDecision: "PASS" | "RESTRUCTURE_REQUIRED" | "FAIL";
  findings: DecisionEnvelope[];
};
```

## Knowledge base can co

- Income haircut rules:
  - Salary via SHB: 0%.
  - Freelance: 50%.
  - Rental income: 30%.
- Debt obligation rules:
  - Auto loan EMI.
  - Credit card obligation = 5% credit limit.
- DTI stress threshold demo: 60%.
- LTV threshold demo: 70%.
- Stress interest rate: 13.5%/year.
- Restructure options: lower home loan, extend tenure, refinance auto loan, reduce credit card obligation.

## Expected calculation

Income:

```text
55M * 100% = 55.0M
25M * 50% = 12.5M
12M * 70% = 8.4M
Valid income = 75.9M/month
```

Original scenario:

```text
Home loan: 2.8B
Tenure: 25 years
DTI stress: about 75.6%
LTV: 80.0%
Result: fail thresholds
```

Restructure scenario:

```text
Home loan: 2.25B
Tenure: 30 years
Auto refinance to SHB
Credit card obligation reduced
DTI stress: about 59.6%
LTV: 64.3%
Result: pass but close to threshold
```

## Cach code

File de xuat:

```text
backend/src/services/agents/credit.agent.ts
backend/src/services/calculators/emi.calculator.ts
backend/src/services/calculators/dti.calculator.ts
backend/src/services/calculators/ltv.calculator.ts
backend/src/services/rules/credit-rule-engine.ts
```

Function goi y:

```ts
calculateEmi(principal: number, annualRate: number, months: number): number;
calculateIncomeAfterHaircut(incomeSources: IncomeSource[]): number;
calculateCurrentMonthlyDebt(debts: Debt[]): number;
calculateDti(totalMonthlyDebt: number, validIncome: number): number;
calculateLtv(loanAmount: number, propertyValue: number): number;
buildRestructureScenario(input: CreditInput): CreditScenario;
runCreditAgent(runId: string, profile: CustomerProfileOutput): Promise<AgentTrace>;
```

## Way handle

- Khong random output.
- Khong de LLM tinh EMI/DTI/LTV.
- Finding phai co reason code.
- Neu calculation fail, return `failed` trace va khong dua decision gia.
- Neu Credit pass nhung Legal veto, Credit phai co re-price/restructure round theo yeu cau Planner.

## Reason codes

- `CREDIT_VALID_INCOME_CALCULATED`
- `CREDIT_DTI_EXCEEDS_LIMIT`
- `CREDIT_LTV_EXCEEDS_LIMIT`
- `CREDIT_RESTRUCTURE_REQUIRED`
- `CREDIT_RESTRUCTURE_PASS`

## Tool calls

Credit Agent co the goi:

- `calculateEmi`
- `applyCreditRules`
- `loadCreditPolicy`

## Acceptance criteria

- Tinh dung valid income 75.9M.
- Original scenario fail DTI/LTV.
- Restructure scenario pass DTI/LTV.
- Trace hien income, DTI, LTV, proposed amount, tenure.
- Output co structured findings va reason codes.

