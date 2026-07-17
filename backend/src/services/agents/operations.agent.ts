import { AgentTrace, ToolCallTrace } from "../../types/trace.types";
import {
  DecisionMatrixOutput,
  LangGraphRunOutput,
  OperationsOutput
} from "../../types/domain.types";
import { createApprovalTicket } from "../tools/approval-ticket.tool";
import {
  createApprovalLetter,
  createLosApprovalRecord,
  createPendingFacility,
  setConditionPrecedents
} from "../tools/los-core.tool";
import { notifyCustomer } from "../tools/customer-notification.tool";
import { assertSideEffectAllowed } from "../governance/tool-rbac.service";
import { citationsFromSources, KnowledgeSource, queryMockKnowledgeBase } from "../rag/mock-knowledge-base.service";
import { END, START, StateGraph } from "../langgraph/simple-state-graph";
import { buildAgentTrace } from "./trace.factory";

export const runOperationsAgent = async (
  runId: string,
  input: {
    decision: DecisionMatrixOutput;
    approvalToken?: string;
  }
): Promise<LangGraphRunOutput<OperationsOutput>> => {
  const startedAt = new Date().toISOString();

  interface OperationsGraphState extends Record<string, unknown> {
    decision: DecisionMatrixOutput;
    approvalToken?: string;
    sources: KnowledgeSource[];
    output?: OperationsOutput;
    toolCalls: ToolCallTrace[];
  }

  const graph = new StateGraph<OperationsGraphState>()
    .addNode("retrieveOperationsPolicy", async (state) => {
      const sources = await queryMockKnowledgeBase("approval facility condition precedent side effect human approval", [
        "operations",
        "tools",
        "approval"
      ]);
      return {
        sources,
        toolCalls: [
          ...state.toolCalls,
          {
            toolName: "queryMockKnowledgeBase",
            input: { query: "approval facility condition precedent side effect human approval" },
            output: { citations: citationsFromSources(sources) },
            status: "success"
          }
        ]
      };
    })
    .addNode("executeChecklist", async (state) => {
      if (state.decision.finalDecision === "REJECTED" || state.decision.finalDecision === "HUMAN_ESCALATION") {
        const ticket = await createApprovalTicket({
          runId,
          finalDecision: state.decision.finalDecision,
          requiredFixes: state.decision.requiredFixes
        });
        const toolCalls: ToolCallTrace[] = [
          ...state.toolCalls,
          {
            toolName: "createApprovalTicket",
            input: { runId, finalDecision: state.decision.finalDecision },
            output: ticket,
            status: "success"
          }
        ];
        return {
          toolCalls,
          output: {
            ticketId: ticket.ticketId as string,
            executionStatus: "BLOCKED",
            toolCalls
          } as OperationsOutput
        };
      }

      const ticket = await createApprovalTicket({
        runId,
        finalDecision: state.decision.finalDecision,
        reasonCodes: state.decision.reasonCodes
      });

      const toolCalls: ToolCallTrace[] = [
        ...state.toolCalls,
        {
          toolName: "createApprovalTicket",
          input: { runId, finalDecision: state.decision.finalDecision },
          output: ticket,
          status: "success"
        }
      ];

      const highTools = ["createApprovalLetter", "createLosApprovalRecord", "createPendingFacility"];
      const blockedHighTool = highTools.find((toolName) => !assertSideEffectAllowed(toolName, state.approvalToken).allowed);

      if (blockedHighTool) {
        const notification = await notifyCustomer({
          runId,
          finalDecision: state.decision.finalDecision,
          conditions: state.decision.conditions
        });
        const blockedCalls: ToolCallTrace[] = [
          ...toolCalls,
          {
            toolName: blockedHighTool,
            input: { runId, approvalTokenPresent: Boolean(state.approvalToken) },
            output: { blockedReason: `${blockedHighTool} requires human approval token` },
            status: "failed"
          },
          {
            toolName: "notifyCustomer",
            input: { runId, conditions: state.decision.conditions.length },
            output: notification,
            status: "success"
          }
        ];

        return {
          toolCalls: blockedCalls,
          output: {
            ticketId: ticket.ticketId as string,
            executionStatus: "PENDING_APPROVAL",
            toolCalls: blockedCalls
          } as OperationsOutput
        };
      }

      const approvalLetter = await createApprovalLetter({
        runId,
        finalDecision: state.decision.finalDecision,
        conditions: state.decision.conditions
      });
      const losRecord = await createLosApprovalRecord(
        { runId, finalDecision: state.decision.finalDecision },
        state.approvalToken
      );
      const facility = await createPendingFacility(
        {
          runId,
          status: state.decision.finalDecision === "CONDITIONAL_PASS" ? "PENDING_CONDITIONS" : "APPROVED"
        },
        state.approvalToken
      );
      const facilityId = facility.facilityId as string;
      const conditionResult = await setConditionPrecedents(facilityId, state.decision.conditions);
      const notification = await notifyCustomer({
        runId,
        finalDecision: state.decision.finalDecision,
        conditions: state.decision.conditions
      });

      const executedCalls: ToolCallTrace[] = [
        ...toolCalls,
        {
          toolName: "createApprovalLetter",
          input: { runId },
          output: approvalLetter,
          status: "success"
        },
        {
          toolName: "createLosApprovalRecord",
          input: { runId },
          output: losRecord,
          status: "success"
        },
        {
          toolName: "createPendingFacility",
          input: { runId },
          output: facility,
          status: "success"
        },
        {
          toolName: "setConditionPrecedents",
          input: { facilityId, conditions: state.decision.conditions.length },
          output: conditionResult,
          status: "success"
        },
        {
          toolName: "notifyCustomer",
          input: { runId, conditions: state.decision.conditions.length },
          output: notification,
          status: "success"
        }
      ];

      return {
        toolCalls: executedCalls,
        output: {
          ticketId: ticket.ticketId as string,
          approvalLetterId: approvalLetter.approvalLetterId as string,
          facilityId,
          executionStatus: state.decision.finalDecision === "CONDITIONAL_PASS" ? "PENDING_CONDITIONS" : "EXECUTED",
          toolCalls: executedCalls
        } as OperationsOutput
      };
    })
    .addEdge(START, "retrieveOperationsPolicy")
    .addEdge("retrieveOperationsPolicy", "executeChecklist")
    .addEdge("executeChecklist", END)
    .compile();

  const state = await graph.invoke({
    decision: input.decision,
    approvalToken: input.approvalToken,
    sources: [],
    toolCalls: []
  });

  if (!state.output) {
    throw new Error("Operations Agent did not produce output.");
  }

  const trace: AgentTrace = buildAgentTrace(
    runId,
    "operations",
    "Create operations checklist and execute guarded mock tools",
    `Operations status ${state.output.executionStatus}; ticket ${state.output.ticketId}.`,
    startedAt,
    state.toolCalls,
    state.output as unknown as Record<string, unknown>,
    state.output.executionStatus === "BLOCKED" || state.output.executionStatus === "PENDING_APPROVAL"
      ? "blocked"
      : "completed"
  );

  return {
    trace,
    output: state.output
  };
};
