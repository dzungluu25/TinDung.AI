import { CreditOutput, CustomerProfileOutput, LangGraphRunOutput } from "../../types/domain.types";
import { ToolCallTrace } from "../../types/trace.types";
import { citationsFromSources, KnowledgeSource } from "../rag/mock-knowledge-base.service";
import { queryCreditPolicies } from "../rag/credit-rag.service";
import { applyCreditRules } from "../rules/credit-rule-engine";
import { END, START, StateGraph } from "../langgraph/simple-state-graph";
import { buildAgentTrace } from "./trace.factory";

export const runCreditAgent = async (
  runId: string,
  profile: CustomerProfileOutput
): Promise<LangGraphRunOutput<CreditOutput>> => {
  const startedAt = new Date().toISOString();

  interface CreditGraphState extends Record<string, unknown> {
    profile: CustomerProfileOutput;
    sources: KnowledgeSource[];
    output?: CreditOutput;
    toolCalls: ToolCallTrace[];
  }

  const graph = new StateGraph<CreditGraphState>()
    .addNode("retrieveCreditRules", async (state) => {
      const sources = await queryCreditPolicies("income haircut DTI LTV stress rate restructure");
      return {
        sources,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "queryMockKnowledgeBase",
            input: { query: "income haircut DTI LTV stress rate restructure" },
            output: { citations: citationsFromSources(sources) },
            status: "success"
          }
        ]
      };
    })
    .addNode("applyCreditRules", (state) => {
      const output = applyCreditRules(state.profile, citationsFromSources(state.sources));
      return {
        output,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "calculateEmi",
            input: {
              originalAmount: state.profile.requestedLoan.requestedAmount,
              restructureAmount: 2_250_000_000,
              stressRate: 0.135
            },
            output: {
              originalEmi: output.originalScenario.homeLoanEmi,
              restructureEmi: output.restructureScenario.homeLoanEmi
            },
            status: "success"
          },
          {
            toolName: "applyCreditRules",
            input: {
              dtiThreshold: 0.6,
              ltvThreshold: 0.7
            },
            output: output as unknown as Record<string, unknown>,
            status: "success"
          }
        ]
      };
    })
    .addEdge(START, "retrieveCreditRules")
    .addEdge("retrieveCreditRules", "applyCreditRules")
    .addEdge("applyCreditRules", END)
    .compile();

  const state = await graph.invoke({
    profile,
    sources: [],
    toolCalls: []
  });

  if (!state.output) {
    throw new Error("Credit Agent did not produce output.");
  }

  return {
    output: state.output,
    trace: buildAgentTrace(
      runId,
      "credit",
      "Calculate income haircut, EMI, DTI, LTV, and restructure proposal",
      `Credit decision ${state.output.creditDecision}: restructure DTI ${(state.output.restructureScenario.dti * 100).toFixed(
        1
      )}% and LTV ${(state.output.restructureScenario.ltv * 100).toFixed(1)}%.`,
      startedAt,
      state.toolCalls,
      state.output as unknown as Record<string, unknown>
    )
  };
};
