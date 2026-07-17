import { DecisionEnvelope } from "../../types/decision.types";
import { DecisionMatrixOutput, LangGraphRunOutput } from "../../types/domain.types";
import { ToolCallTrace } from "../../types/trace.types";
import { applyDecisionMatrix } from "../rules/decision-priority-rule-pack";
import { citationsFromSources, KnowledgeSource, queryMockKnowledgeBase } from "../rag/mock-knowledge-base.service";
import { END, START, StateGraph } from "../langgraph/simple-state-graph";
import { buildAgentTrace } from "./trace.factory";

interface RiskGraphState extends Record<string, unknown> {
  findings: DecisionEnvelope[];
  sources: KnowledgeSource[];
  output?: DecisionMatrixOutput;
  toolCalls: ToolCallTrace[];
}

export const runRiskDecisionMatrixAgent = async (
  runId: string,
  findings: DecisionEnvelope[]
): Promise<LangGraphRunOutput<DecisionMatrixOutput>> => {
  const startedAt = new Date().toISOString();

  const graph = new StateGraph<RiskGraphState>()
    .addNode("retrieveDecisionRules", async (state) => {
      const sources = await queryMockKnowledgeBase("decision priority legal blocker credit restructure conditions", [
        "risk",
        "decision"
      ]);
      return {
        sources,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "queryMockKnowledgeBase",
            input: { query: "decision priority legal blocker credit restructure conditions" },
            output: { citations: citationsFromSources(sources) },
            status: "success"
          }
        ]
      };
    })
    .addNode("applyDecisionMatrix", (state) => {
      const output = applyDecisionMatrix(state.findings);
      return {
        output,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "validateAgentOutput",
            input: { findingCount: state.findings.length },
            output: {
              valid: state.findings.every((finding) => finding.ruleIds.length > 0 && finding.citations.length > 0)
            },
            status: "success"
          },
          {
            toolName: "applyDecisionMatrix",
            input: { findingCount: state.findings.length },
            output: output as unknown as Record<string, unknown>,
            status: "success"
          }
        ]
      };
    })
    .addEdge(START, "retrieveDecisionRules")
    .addEdge("retrieveDecisionRules", "applyDecisionMatrix")
    .addEdge("applyDecisionMatrix", END)
    .compile();

  const state = await graph.invoke({
    findings,
    sources: [],
    toolCalls: []
  });

  if (!state.output) {
    throw new Error("Risk Decision Matrix Agent did not produce output.");
  }

  return {
    output: state.output,
    trace: buildAgentTrace(
      runId,
      "risk",
      "Aggregate findings, apply veto priority, and choose final gate",
      `Decision matrix selected ${state.output.finalDecision} with ${state.output.conditions.length} condition(s).`,
      startedAt,
      state.toolCalls,
      state.output as unknown as Record<string, unknown>,
      state.output.finalDecision === "HUMAN_ESCALATION" ? "blocked" : "completed"
    )
  };
};
