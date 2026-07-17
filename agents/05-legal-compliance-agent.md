# Legal & Compliance Agent

## Vai tro

Legal & Compliance Agent kiem tra cheo Credit/Product findings. Agent nay co veto power: neu compliance violation thi Planner va Operations khong duoc override.

Day la agent quan trong nhat de chung minh he thong khac chatbot: no khong chi tra loi, ma chan action sai.

## Flow

```text
Receive credit/product/profile findings
-> Check insurance tying
-> Check marital property
-> Check future-property project condition
-> Check consent before external data call
-> Build legal decision envelopes
-> Return PASS / CONDITIONAL_PASS / VIOLATION / BLOCKED
```

## Input

```ts
type LegalInput = {
  runId: string;
  customerProfile: CustomerProfileOutput;
  creditOutput: CreditOutput;
  productOutput: ProductPolicyOutput;
  consentRegistry: ConsentRegistry;
};
```

## Output

```ts
type LegalOutput = {
  gateStatus: "PASS" | "CONDITIONAL_PASS" | "VIOLATION" | "BLOCKED";
  findings: DecisionEnvelope[];
  requiredFixes: string[];
  conditions: ConditionPrecedent[];
};
```

## Knowledge base can co

- Insurance tying rule:
  - Preferential loan rate must not be conditioned on purchasing non-mandatory insurance.
- Marital property rule:
  - Property acquired during marriage may require spouse signature or proof of separate property.
- Future-property rule:
  - Disbursement may require project guarantee/lien release documents.
- Personal data protection:
  - External enrichment requires consent scope.
- Internal demo rule IDs and citations/source names.

## Core checks

### 1. Insurance tying

Input trap:

```text
7.5% if insurance purchased, 8.3% otherwise
```

Expected:

```text
VIOLATION
BLOCKER
blocksAt: APPROVAL
requiredFix: Remove insurance_purchase from pricing function and re-price.
```

### 2. Marital property

Expected:

```text
CONDITION
blocksAt: CONTRACT_SIGNING
condition: spouse signs mortgage contract or customer proves separate property.
```

### 3. Future property project

Expected:

```text
CONDITION
blocksAt: DISBURSEMENT
condition: provide project guarantee or lien release document.
```

### 4. Consent guard

Expected:

```text
BLOCKED
blocksAt: EXTERNAL_DATA_CALL
condition: obtain separate consent before tax/social-insurance income verification.
```

## Cach code

File de xuat:

```text
backend/src/services/agents/legal.agent.ts
backend/src/services/rules/legal-rule-engine.ts
backend/src/services/rules/legal-rule-pack.ts
backend/src/services/governance/consent-guard.service.ts
```

Function goi y:

```ts
checkInsuranceTying(pricingOffer: PricingOffer): DecisionEnvelope;
checkMaritalProperty(profile: CustomerProfileOutput): DecisionEnvelope;
checkFuturePropertyProject(property: PropertyInfo): DecisionEnvelope;
checkConsentBeforeExternalCall(consent: ConsentRegistry, scope: string): DecisionEnvelope;
runLegalAgent(runId: string, input: LegalInput): Promise<AgentTrace>;
```

## Way handle

- Khong overclaim phap ly neu chua chac citation.
- Legal finding phai co rule ID/source.
- Legal khong tinh DTI/LTV.
- Legal co quyen veto pricing/consent.
- `CONDITIONAL_PASS` khac `PASS`: van can condition precedent.

## Tool calls

- `applyLegalRulePack`
- `checkConsentScope`
- `validateCitationPresence`

## Acceptance criteria

- Chặn duoc pricing gan bao hiem.
- Set dung blocker placement: approval, contract signing, disbursement, external data call.
- Sau re-price, gate status la `CONDITIONAL_PASS`.
- Moi legal finding co rule ID/source.

