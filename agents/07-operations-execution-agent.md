# Operations Execution Agent

## Vai tro

Operations Execution Agent bien decision da qua gate thanh action mock trong he thong van hanh: approval letter, LOS record, pending facility, condition precedent, customer notification.

Agent nay khong duoc tu approve khoan vay.

## Flow

```text
Receive final decision and conditions
-> Build execution checklist
-> If action is HIGH side-effect, require approval token
-> Create approval letter
-> Create LOS approval record
-> Create Core facility with PENDING_CONDITIONS
-> Set condition precedents
-> Notify customer
-> Append audit log
```

## Input

```ts
type OperationsInput = {
  runId: string;
  finalDecision: "FAST_PASS" | "PASS" | "CONDITIONAL_PASS" | "REJECTED" | "HUMAN_ESCALATION";
  conditions: ConditionPrecedent[];
  approvalToken?: string;
};
```

## Output

```ts
type OperationsOutput = {
  ticketId: string;
  approvalLetterId?: string;
  facilityId?: string;
  executionStatus: "PENDING_APPROVAL" | "PENDING_CONDITIONS" | "EXECUTED" | "BLOCKED";
  toolCalls: ToolCallTrace[];
};
```

## Knowledge base can co

- LOS/Core mock action schemas.
- Side-effect levels:
  - LOW: read/check/list.
  - MEDIUM: create draft/checklist.
  - HIGH: create approval/facility/core record.
- Condition precedent templates.
- Customer notification templates.
- Saga rollback/compensation rules.

## Cach code

File de xuat:

```text
backend/src/services/agents/operations.agent.ts
backend/src/services/tools/los-core.tool.ts
backend/src/services/tools/customer-notification.tool.ts
backend/src/services/tools/approval-ticket.tool.ts
backend/src/services/orchestration/saga-executor.service.ts
```

Function goi y:

```ts
createApprovalLetter(payload: object): ToolResult;
createLosApprovalRecord(payload: object, approvalToken?: string): ToolResult;
createPendingFacility(payload: object, approvalToken?: string): ToolResult;
setConditionPrecedents(facilityId: string, conditions: ConditionPrecedent[]): ToolResult;
notifyCustomer(payload: object): ToolResult;
runOperationsAgent(runId: string, input: OperationsInput): Promise<{ trace: AgentTrace; ticketId?: string }>;
```

## Way handle

- Neu final decision la `REJECTED`, khong tao approval/facility.
- Neu `CONDITIONAL_PASS`, facility status phai la `PENDING_CONDITIONS`.
- Neu thieu approval token, HIGH tools bi block va trace ghi `PENDING_APPROVAL`.
- Neu saga step loi, chay compensation va audit.
- Notification cho khach hang chi nen la checklist/next steps, khong claim final disbursement.

## Tool calls

- `createApprovalLetter`
- `createLosApprovalRecord`
- `createPendingFacility`
- `setConditionPrecedents`
- `notifyCustomer`
- `appendAuditLog`

## Acceptance criteria

- Truoc human approval, HIGH write bi block.
- Sau approval, tao duoc mock approval/facility.
- Conditions duoc gan vao facility.
- Trace hien execution checklist va tool call output.

