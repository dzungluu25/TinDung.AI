import { CustomerProfileOutput, LangGraphRunOutput } from "../../types/domain.types";
import { ToolCallTrace } from "../../types/trace.types";
import { citationsFromSources, KnowledgeSource, queryMockKnowledgeBase } from "../rag/mock-knowledge-base.service";
import { loadRetailCase, RetailCase } from "../data/retail-case-data";
import { normalizeCustomerProfile } from "../data/document-normalizer";
import { maskPii } from "../governance/pii-masking.service";
import { END, START, StateGraph } from "../langgraph/simple-state-graph";
import { buildAgentTrace } from "./trace.factory";

interface CustomerProfileGraphState extends Record<string, unknown> {
  runId: string;
  caseId: string;
  startedAt: string;
  sources: KnowledgeSource[];
  rawCase?: RetailCase;
  output?: CustomerProfileOutput;
  toolCalls: ToolCallTrace[];
}

export const runCustomerProfileAgent = async (
  runId: string,
  caseId: string
): Promise<LangGraphRunOutput<CustomerProfileOutput>> => {
  const startedAt = new Date().toISOString();

  const graph = new StateGraph<CustomerProfileGraphState>()
    .addNode("retrieveProfileKnowledge", async (state) => {
      const sources = await queryMockKnowledgeBase("profile field mapping consent PII documents", [
        "profile",
        "documents",
        "classification"
      ]);
      return {
        sources,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "queryMockKnowledgeBase",
            input: { query: "profile field mapping consent PII documents" },
            output: { citations: citationsFromSources(sources) },
            status: "success"
          }
        ]
      };
    })
    .addNode("loadCaseData", async (state) => {
      const rawCase = await loadRetailCase(state.caseId);
      return {
        rawCase,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "loadCustomerProfile",
            input: { caseId: state.caseId },
            output: { customerId: rawCase.customerId, documents: rawCase.documents.length },
            status: "success"
          }
        ]
      };
    })
    .addNode("normalizeAndMask", (state) => {
      if (!state.rawCase) {
        throw new Error("Customer profile graph missing raw case data.");
      }
      const normalized = normalizeCustomerProfile(state.rawCase);
      const maskedRaw = maskPii(state.rawCase);
      return {
        output: normalized,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "loadParsedDocuments",
            input: { caseId: state.caseId },
            output: { documentIds: normalized.documents.map((document) => document.id) },
            status: "success"
          },
          {
            toolName: "loadConsentRegistry",
            input: { customerId: state.rawCase.customerId },
            output: normalized.consent as unknown as Record<string, unknown>,
            status: "success"
          },
          {
            toolName: "maskDashboardPayload",
            input: { caseId: state.caseId },
            output: { piiMasked: true, customerName: maskedRaw.customerName, pii: maskedRaw.pii },
            status: "success"
          }
        ]
      };
    })
    .addEdge(START, "retrieveProfileKnowledge")
    .addEdge("retrieveProfileKnowledge", "loadCaseData")
    .addEdge("loadCaseData", "normalizeAndMask")
    .addEdge("normalizeAndMask", END)
    .compile();

  const state = await graph.invoke({
    runId,
    caseId,
    startedAt,
    sources: [],
    toolCalls: []
  });

  if (!state.output) {
    throw new Error("Customer Profile Agent did not produce output.");
  }

  return {
    output: state.output,
    trace: buildAgentTrace(
      runId,
      "customer-profile",
      "Load, normalize, classify, and mask customer profile",
      `Normalized profile for ${state.output.customerId}; PII masked and consent registry loaded.`,
      startedAt,
      state.toolCalls,
      {
        customerId: state.output.customerId,
        demographic: state.output.demographic,
        incomeSources: state.output.incomeSources,
        currentDebts: state.output.currentDebts,
        requestedLoan: state.output.requestedLoan,
        property: state.output.property,
        consent: state.output.consent,
        piiMasked: state.output.piiMasked
      }
    )
  };
};
