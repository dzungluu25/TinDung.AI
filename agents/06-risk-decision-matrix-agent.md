# Risk & Decision Matrix Agent

## Vai tro

Risk & Decision Matrix Agent tong hop output da validate tu Credit, Product, Legal va Governance. Agent nay quyet dinh gate result cuoi cung theo rule deterministic, khong de LLM tu phan quyet.

## Flow

```text
Receive validated agent outputs
-> Check schema validation result
-> Apply veto priority
-> Evaluate credit/risk thresholds
-> Evaluate legal blockers
-> Build final decision matrix
-> Return final gate status and next action
```

## Input

```ts
type DecisionMatrixInput = {
  creditFindings: DecisionEnvelope[];
  productFindings: DecisionEnvelope[];
  legalFindings: DecisionEnvelope[];
  governanceFindings: DecisionEnvelope[];
};
```

## Output

```ts
type DecisionMatrixOutput = {
  finalDecision: "FAST_PASS" | "PASS" | "CONDITIONAL_PASS" | "REJECTED" | "HUMAN_ESCALATION";
  vetoedBy?: string;
  reasonCodes: string[];
  conditions: ConditionPrecedent[];
  requiredFixes: string[];
};
```

## Knowledge base can co

- Veto priority:
  - Legal/Compliance BLOCKER wins.
  - Consent missing blocks external data call.
  - Credit fail can reject or require restructure.
  - Operations cannot override.
- Severity ranking.
- Mapping `blocksAt` to workflow action.
- Human escalation rules.

## Cach code

File de xuat:

```text
backend/src/services/orchestration/decision-matrix.service.ts
backend/src/services/rules/decision-priority-rule-pack.ts
backend/src/services/validation/agent-output-validator.ts
```

Function goi y:

```ts
validateAgentOutput(output: unknown): ValidationResult;
applyVetoRules(findings: DecisionEnvelope[]): VetoResult;
aggregateConditions(findings: DecisionEnvelope[]): ConditionPrecedent[];
decideNextAction(input: DecisionMatrixInput): DecisionMatrixOutput;
```

## Way handle

- Neu co `VIOLATION` blocksAt `APPROVAL`, khong cho Operations tao approval.
- Neu chi co condition tai `CONTRACT_SIGNING` hoac `DISBURSEMENT`, co the `CONDITIONAL_PASS`.
- Neu Credit original fail nhung restructure pass, decision co the `CONDITIONAL_PASS`.
- Neu missing citation o legal finding, route `HUMAN_ESCALATION` hoac fail validation.
- Neu agent output sai schema qua retry limit, safe stop.

## Decision priority

```text
1. Schema invalid -> retry/fallback/human escalation
2. Legal approval blocker -> violation/fix request
3. Consent missing -> block external data call
4. Credit fail without restructure -> reject/request lower amount
5. Credit pass with legal conditions -> conditional pass
6. No blockers -> pass
```

## Tool calls

Risk Matrix khong nen goi external tool. Chi dung:

- `validateAgentOutput`
- `applyDecisionMatrix`
- `appendDecisionAudit`

## Acceptance criteria

- Chọn đúng `CONDITIONAL_PASS` cho case chính.
- Chặn approval khi insurance tying chưa re-price.
- Gộp conditions cho contract signing/disbursement.
- Return reason codes ro rang cho dashboard.

