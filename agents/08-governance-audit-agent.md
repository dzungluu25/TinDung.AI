# Governance & Audit Agent

## Vai tro

Governance & Audit Agent la lop bao ve xuyen suot workflow. Agent nay dam bao PII masking, consent guard, model/cost budget, RBAC tool access, side-effect guard va audit trail.

Day la phan giup demo co Responsible AI va phu hop moi truong ngan hang.

## Flow

```text
Before model/tool/dashboard output
-> Classify data
-> Mask/tokenize PII
-> Check consent scope
-> Check tool permission and side-effect level
-> Check model/cost budget
-> Record audit event
-> Allow or block
```

## Input

```ts
type GovernanceInput = {
  runId: string;
  actor: string;
  actionType: "agent_call" | "tool_call" | "model_call" | "dashboard_output" | "human_approval";
  payload: Record<string, unknown>;
  approvalToken?: string;
};
```

## Output

```ts
type GovernanceOutput = {
  allowed: boolean;
  maskedPayload: Record<string, unknown>;
  auditEvent: AuditEvent;
  budgetStatus: CostBudgetStatus;
  blockedReason?: string;
};
```

## Knowledge base can co

- PII fields:
  - CCCD/passport.
  - Account number.
  - Phone.
  - Email.
  - Address.
  - CIC code.
- Consent scopes:
  - credit_check.
  - tax_income_check.
  - social_insurance_check.
  - marketing.
- Tool RBAC:
  - Agent nao duoc goi tool nao.
- Side-effect policy:
  - HIGH write requires approval token.
- Model budget:
  - max model calls.
  - max tokens.
  - replay mode.

## Cach code

File de xuat:

```text
backend/src/services/governance/pii-masking.service.ts
backend/src/services/governance/consent-guard.service.ts
backend/src/services/governance/tool-rbac.service.ts
backend/src/services/governance/cost-budget.service.ts
backend/src/services/governance/audit-log.service.ts
backend/src/services/governance/model-gateway.service.ts
```

Function goi y:

```ts
maskPii(payload: Record<string, unknown>): Record<string, unknown>;
assertConsent(scope: string, registry: ConsentRegistry): GuardResult;
assertToolPermission(agent: string, toolName: string): GuardResult;
assertSideEffectAllowed(toolName: string, approvalToken?: string): GuardResult;
recordAuditEvent(event: AuditEvent): void;
callModelThroughGateway(request: ModelGatewayRequest): Promise<ModelGatewayResponse>;
```

## Way handle

- Fail closed: neu guard loi, block action.
- Khong gui raw PII vao model.
- Khong goi BHXH/thue neu thieu consent rieng.
- LLM chi de summarize/explain, khong tinh so.
- Replay mode phai co de demo on dinh.

## Dashboard fields

Nen hien:

```text
PII masked: true
missing consent external calls: 0
HIGH writes before approval: 0
model calls used: x/y
estimated cost: demo value
replay mode: true/false
```

## Tool calls

Governance Agent khong goi nghiep vu banking truc tiep. No wrap cac call:

- `guardToolCall`
- `guardModelCall`
- `maskDashboardPayload`
- `appendAuditEvent`

## Acceptance criteria

- PII duoc mask trong dashboard trace.
- Missing consent block external call.
- HIGH side-effect block truoc approval.
- Audit log co agent/tool/rule/timestamp.
- Cost/replay panel co du lieu.

