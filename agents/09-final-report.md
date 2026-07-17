# Final Report: Task Split by Agent

## Summary

Team nen build demo theo workflow-driven multi-agent architecture. Router/Planner tao dependency graph; cac agent doc lap chay song song; output duoc validate; Legal/Risk co veto; Operations chi execute sau gate va human approval; Governance/Audit bao ve du lieu va trace.

## Recommended agents

| File | Owner | Main deliverable |
| --- | --- | --- |
| `01-router-planner-agent.md` | Backend orchestration | FAST/COMPLEX routing, dependency graph, conflict handling |
| `02-customer-profile-agent.md` | Data/case owner | Retail case data, profile normalization, consent registry |
| `03-credit-assessment-agent.md` | Credit owner | EMI, DTI, LTV, income haircut, restructure proposal |
| `04-product-policy-agent.md` | Product owner | Product policy retrieval, pricing offer, re-price support |
| `05-legal-compliance-agent.md` | Legal/compliance owner | Insurance tying, marital property, future-property, consent checks |
| `06-risk-decision-matrix-agent.md` | Risk owner | Structured validation, veto control, final decision |
| `07-operations-execution-agent.md` | Operations owner | Approval letter, pending facility, condition precedents, notification |
| `08-governance-audit-agent.md` | Governance owner | PII masking, consent guard, tool RBAC, cost/replay, audit |

## Build order

1. Shared types and retail case seed data.
2. Router/Planner with dependency graph.
3. Customer Profile Agent.
4. Credit calculators.
5. Product Policy + Legal Compliance Gate.
6. Risk Decision Matrix.
7. Operations tools with approval guard.
8. Governance/Audit wrapper.
9. Frontend dashboard trace.

## Minimum demo scenarios

| Case | Expected result |
| --- | --- |
| Complex main case | `CONDITIONAL_PASS`, 2.25B proposal, 30 years, DTI stress about 59.6%, LTV about 64.3% |
| Fast clean case | `FAST_PASS`, no full specialist workflow |
| Insurance tying only | `VIOLATION`, block approval and require re-price |
| Missing spouse signature | `BLOCKS_AT_CONTRACT_SIGNING` |
| Missing project guarantee | `BLOCKS_AT_DISBURSEMENT` |
| Missing consent | `CONSENT_REQUIRED`, no external data call |
| DTI fail after restructure | `REJECT_OR_REQUEST_LOWER_AMOUNT` |
| Prompt injection document | Ignore injection and create audit event |

## Definition of done

- Router phan biet FAST vs COMPLEX.
- Credit tinh deterministic, khong random.
- Legal chan pricing gan bao hiem.
- Decision Matrix chon dung `CONDITIONAL_PASS`.
- Operations block HIGH write truoc approval.
- Governance mask PII va log audit.
- Dashboard hien agent trace, tool calls, conditions, audit/cost/governance panel.

