import { CustomerProfileOutput, LangGraphRunOutput, ProductPolicyOutput } from "../../types/domain.types";
import { ToolCallTrace } from "../../types/trace.types";
import { citationsFromSources, KnowledgeSource } from "../rag/mock-knowledge-base.service";
import { queryProductPolicies } from "../rag/product-policy-rag.service";
import { buildProductPolicyOutput } from "../rules/product-policy-rule-pack";
import { END, START, StateGraph } from "../langgraph/simple-state-graph";
import { buildAgentTrace } from "./trace.factory";

interface ProductPolicyGraphState extends Record<string, unknown> {
  profile: CustomerProfileOutput;
  repriceRequested: boolean;
  sources: KnowledgeSource[];
  output?: ProductPolicyOutput;
  toolCalls: ToolCallTrace[];
}

export const runProductPolicyAgent = async (
  runId: string,
  profile: CustomerProfileOutput,
  repriceRequested = false
): Promise<LangGraphRunOutput<ProductPolicyOutput>> => {
  const startedAt = new Date().toISOString();

  const graph = new StateGraph<ProductPolicyGraphState>()
    .addNode("retrieveProductPolicies", async (state) => {
      const sources = await queryProductPolicies("future home loan auto refinance pricing insurance optional");
      return {
        sources,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "queryMockKnowledgeBase",
            input: { query: "future home loan auto refinance pricing insurance optional" },
            output: { citations: citationsFromSources(sources) },
            status: "success"
          }
        ]
      };
    })
    .addNode("buildPricingOffer", (state) => {
      const output = buildProductPolicyOutput(
        state.profile,
        citationsFromSources(state.sources),
        state.repriceRequested
      );
      return {
        output,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "validateProductEligibility",
            input: {
              requestedAmount: state.profile.requestedLoan.requestedAmount,
              insurancePreference: state.profile.requestedLoan.insurancePreference
            },
            output: { eligibleProducts: output.eligibleProducts.map((product) => product.id) },
            status: "success"
          },
          {
            toolName: "buildPricingOffer",
            input: { repriceRequested: state.repriceRequested },
            output: output.pricingOffer as unknown as Record<string, unknown>,
            status: "success"
          }
        ]
      };
    })
    .addEdge(START, "retrieveProductPolicies")
    .addEdge("retrieveProductPolicies", "buildPricingOffer")
    .addEdge("buildPricingOffer", END)
    .compile();

  const state = await graph.invoke({
    profile,
    repriceRequested,
    sources: [],
    toolCalls: []
  });

  if (!state.output) {
    throw new Error("Product Policy Agent did not produce output.");
  }

  return {
    output: state.output,
    trace: buildAgentTrace(
      runId,
      "product-policy",
      repriceRequested ? "Re-price product offer after legal veto" : "Match products and produce initial pricing offer",
      repriceRequested
        ? "Re-priced home loan at 7.5% with insurance optional for all eligible customers."
        : "Built initial product offer with an insurance-linked pricing trap for Legal to validate.",
      startedAt,
      state.toolCalls,
      state.output as unknown as Record<string, unknown>
    )
  };
};
