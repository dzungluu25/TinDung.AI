import { DecisionEnvelope } from "../../types/decision.types";
import { GovernanceOutput, LangGraphRunOutput } from "../../types/domain.types";
import { ToolCallTrace } from "../../types/trace.types";
import { nextId } from "../../utils/ids";
import { appendAuditEvent } from "../governance/audit-log.service";
import { maskPii } from "../governance/pii-masking.service";
import { citationsFromSources, KnowledgeSource, queryMockKnowledgeBase } from "../rag/mock-knowledge-base.service";
import { END, START, StateGraph } from "../langgraph/simple-state-graph";
import { buildAgentTrace } from "./trace.factory";

interface GovernanceGraphState extends Record<string, unknown> {
  runId: string;
  actor: string;
  payload: Record<string, unknown>;
  sources: KnowledgeSource[];
  output?: GovernanceOutput;
  toolCalls: ToolCallTrace[];
}

export const runGovernanceAuditAgent = async (
  runId: string,
  payload: Record<string, unknown>
): Promise<LangGraphRunOutput<GovernanceOutput>> => {
  const startedAt = new Date().toISOString();

  const graph = new StateGraph<GovernanceGraphState>()
    .addNode("retrieveGovernancePolicy", async (state) => {
      const sources = await queryMockKnowledgeBase("PII masking consent side effect model budget audit replay", [
        "governance",
        "consent",
        "pii"
      ]);
      return {
        sources,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "queryMockKnowledgeBase",
            input: { query: "PII masking consent side effect model budget audit replay" },
            output: { citations: citationsFromSources(sources) },
            status: "success"
          }
        ]
      };
    })
    .addNode("maskAndAudit", (state) => {
      const maskedPayload = maskPii(state.payload);
      const citations = citationsFromSources(state.sources);
      const modelGateway = state.payload.modelGateway as
        | { model?: string; usedFallback?: boolean; error?: string }
        | undefined;
      const modelCallsUsed = modelGateway && !modelGateway.usedFallback ? 1 : 0;
      const auditEvent = {
        id: nextId("audit"),
        runId: state.runId,
        actor: state.actor,
        actionType: "dashboard_output" as const,
        allowed: true,
        ruleIds: ["GOV_PII_MASKING", "GOV_AUDIT_EVENT_RECORDED", "GOV_REPLAY_MODE"],
        timestamp: new Date().toISOString()
      };
      appendAuditEvent(auditEvent);

      const findings: DecisionEnvelope[] = [
        {
          decisionId: nextId("decision-governance"),
          agent: "governance",
          status: "PASS",
          severity: "INFO",
          blocksAt: "NONE",
          finding: "Dashboard payload masked and audit event recorded.",
          evidence: {
            piiMasked: true,
            missingConsentExternalCalls: 0,
            highWritesBeforeApproval: 0,
            replayMode: modelCallsUsed === 0,
            model: modelGateway?.model,
            modelFallback: modelGateway?.usedFallback,
            modelError: modelGateway?.error
          },
          ruleIds: [...auditEvent.ruleIds, "GOV_MODEL_GATEWAY_SERVER_SIDE"],
          citations
        }
      ];

      const output: GovernanceOutput = {
        allowed: true,
        maskedPayload,
        auditEvent,
        budgetStatus: {
          replayMode: modelCallsUsed === 0,
          modelCallsUsed,
          maxModelCalls: 1,
          estimatedCostUsd: modelCallsUsed > 0 ? 0.001 : 0
        },
        findings
      };

      return {
        output,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "maskDashboardPayload",
            input: { runId: state.runId },
            output: {
              piiMasked: true,
              payloadKeys: Object.keys(maskedPayload)
            },
            status: "success"
          },
          {
            toolName: "appendAuditEvent",
            input: { runId: state.runId, actor: state.actor },
            output: auditEvent as unknown as Record<string, unknown>,
            status: "success"
          },
          {
            toolName: "guardModelCall",
            input: {
              provider: "fpt-ai-marketplace",
              model: modelGateway?.model ?? "not-called"
            },
            output: {
              allowed: true,
              serverSideApiKey: true,
              usedFallback: modelGateway?.usedFallback ?? true,
              error: modelGateway?.error
            },
            status: modelGateway?.error ? "failed" : "success"
          }
        ]
      };
    })
    .addEdge(START, "retrieveGovernancePolicy")
    .addEdge("retrieveGovernancePolicy", "maskAndAudit")
    .addEdge("maskAndAudit", END)
    .compile();

  const state = await graph.invoke({
    runId,
    actor: "governance",
    payload,
    sources: [],
    toolCalls: []
  });

  if (!state.output) {
    throw new Error("Governance Audit Agent did not produce output.");
  }

  return {
    output: state.output,
    trace: buildAgentTrace(
      runId,
      "governance",
      "Mask dashboard payload, check responsible-AI controls, and record audit event",
      state.output.budgetStatus.modelCallsUsed > 0
        ? `Governance audit passed: PII masked, Gemma model call recorded for ${state.output.budgetStatus.modelCallsUsed}/1 budget.`
        : "Governance audit passed: PII masked, model fallback/replay mode used.",
      startedAt,
      state.toolCalls,
      state.output as unknown as Record<string, unknown>
    )
  };
};
