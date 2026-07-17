# Router & Planner Agent

## Vai tro

Router & Planner Agent la bo dieu phoi trung tam. Agent nay quyet dinh request di FAST lane hay COMPLEX lane, truy xuat workflow chuan, tao dependency graph va goi dung specialist agents.

Planner khong tinh toan tin dung, khong ket luan phap ly va khong override veto cua Legal/Risk.

## Flow

```text
Receive user prompt/case
-> Check semantic cache or fast-path rules
-> Classify FAST vs COMPLEX
-> Retrieve standard workflow template
-> Build dependency graph
-> Trigger independent agents
-> Collect structured outputs
-> Send outputs to validation and decision matrix
-> If conflict: request fix or human escalation
-> Return final orchestration response
```

## Input

```ts
type PlannerInput = {
  prompt: string;
  caseId?: string;
  approvalToken?: string;
};
```

## Output

```ts
type PlannerOutput = {
  runId: string;
  tier: "FAST" | "COMPLEX";
  workflowId: string;
  taskGraph: AgentTask[];
  finalAnswer: string;
  traces: AgentTrace[];
};
```

## Knowledge base can co

- Workflow template cho retail mortgage/refinance.
- Rule phan loai FAST vs COMPLEX.
- Agent capability registry: agent nao lam duoc task nao.
- Dependency rules: task nao phu thuoc task nao.
- Veto rules: Legal/Risk block thi Operations khong duoc execute.

## Cach code

File chinh:

```text
backend/src/services/orchestration/planner.service.ts
```

Nen tach them:

```text
backend/src/services/orchestration/risk-router.service.ts
backend/src/services/orchestration/workflow-template.service.ts
backend/src/services/orchestration/dependency-graph.service.ts
backend/src/services/orchestration/decision-aggregator.service.ts
```

Function goi y:

```ts
detectRiskTier(input: PlannerInput): "FAST" | "COMPLEX";
retrieveWorkflowTemplate(tier: "FAST" | "COMPLEX"): WorkflowTemplate;
buildDependencyGraph(template: WorkflowTemplate): AgentTask[];
executeRetailWorkflow(input: PlannerInput): Promise<OrchestrationResponse>;
resolveConflict(findings: DecisionEnvelope[]): ConflictResolution;
```

## Way handle

- FAST case: request don gian, khong co refinance, khong co collateral phuc tap, khong co legal trap.
- COMPLEX case: co nha hinh thanh trong tuong lai, refinance, missing consent, insurance pricing, spouse/collateral issues.
- Neu Legal phat hien pricing gan bao hiem, Planner phai yeu cau Credit/Product re-price.
- Neu output agent sai schema, Planner retry hoac mark human escalation.
- Neu thieu du lieu quan trong, Planner khong duoc bia output.

## Tool calls

Router/Planner thuong khong goi tool nghiep vu truc tiep. Tool cua Planner chi nen la:

- `retrieveWorkflowTemplate`
- `loadCaseData`
- `saveOrchestrationRun`
- `appendAuditEvent`

## Acceptance criteria

- Tao duoc `runId`.
- Phan biet FAST va COMPLEX.
- Tao trace co Router, Planner, Credit, Legal, Risk, Ops.
- Khong execute Operations khi Legal/Risk chua pass.
- Conflict pricing bao hiem duoc route ve re-price.

