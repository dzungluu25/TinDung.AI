import {
  CreditOutput,
  CustomerProfileOutput,
  LangGraphRunOutput,
  LegalOutput,
  ProductPolicyOutput
} from "../../types/domain.types";
import { ToolCallTrace } from "../../types/trace.types";
import { citationsFromSources, KnowledgeSource } from "../rag/mock-knowledge-base.service";
import { queryLegalRequirements } from "../rag/legal-rag.service";
import { buildLegalOutput } from "../rules/legal-rule-engine";
import { END, START, StateGraph } from "../langgraph/simple-state-graph";
import { buildAgentTrace } from "./trace.factory";

export const runLegalAgent = async (
  runId: string,
  input: {
    customerProfile: CustomerProfileOutput;
    creditOutput: CreditOutput;
    productOutput: ProductPolicyOutput;
  }
): Promise<LangGraphRunOutput<LegalOutput>> => {
  const startedAt = new Date().toISOString();

  interface LegalGraphState extends Record<string, unknown> {
    input: {
      customerProfile: CustomerProfileOutput;
      creditOutput: CreditOutput;
      productOutput: ProductPolicyOutput;
    };
    sources: KnowledgeSource[];
    output?: LegalOutput;
    toolCalls: ToolCallTrace[];
  }

  const graph = new StateGraph<LegalGraphState>()
    .addNode("retrieveLegalRules", async (state) => {
      const sources = await queryLegalRequirements(
        "insurance tying marital property future property project guarantee consent external calls"
      );
      return {
        sources,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "queryMockKnowledgeBase",
            input: {
              query: "insurance tying marital property future property project guarantee consent external calls"
            },
            output: { citations: citationsFromSources(sources) },
            status: "success"
          }
        ]
      };
    })
    .addNode("applyLegalRulePack", (state) => {
      const output = buildLegalOutput(
        state.input.customerProfile,
        state.input.productOutput,
        citationsFromSources(state.sources)
      );
      return {
        output,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "applyLegalRulePack",
            input: {
              pricingOffer: state.input.productOutput.pricingOffer,
              maritalStatus: state.input.customerProfile.demographic.maritalStatus,
              property: state.input.customerProfile.property
            },
            output: output as unknown as Record<string, unknown>,
            status: "success"
          }
        ]
      };
    })
    .addEdge(START, "retrieveLegalRules")
    .addEdge("retrieveLegalRules", "applyLegalRulePack")
    .addEdge("applyLegalRulePack", END)
    .compile();

  const state = await graph.invoke({
    input,
    sources: [],
    toolCalls: []
  });

  if (!state.output) {
    throw new Error("Legal Agent did not produce output.");
  }

  return {
    output: state.output,
    trace: buildAgentTrace(
      runId,
      "legal",
      "Check insurance tying, marital property, future-property, and consent guards",
      `Legal gate ${state.output.gateStatus}; ${state.output.conditions.length} condition(s), ${state.output.requiredFixes.length} required fix(es).`,
      startedAt,
      state.toolCalls,
      state.output as unknown as Record<string, unknown>,
      state.output.gateStatus === "VIOLATION" ? "blocked" : "completed"
    )
  };
};
