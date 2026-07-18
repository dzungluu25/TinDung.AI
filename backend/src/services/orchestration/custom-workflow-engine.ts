import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { WorkflowDefinition, WorkflowNode, WorkflowRunEvent, WorkflowRunNodeOutput } from "../../types/workflow.types";
import { runGuardedLlmCall } from "../governance/generic-model-gateway";
import { buildToolsForNode } from "./custom-workflow-tools";

/**
 * Hard cap on executed nodes per run — a user-drawn Semi-sequential loop can cycle back
 * to an earlier node, and LangGraph itself does not know this is unsafe. Once stepCount
 * reaches this, node runners short-circuit (no further LLM/tool calls) instead of relying
 * solely on LangGraph's own default recursion-limit error as the only backstop.
 */
const MAX_STEPS = 20;

/**
 * State for the additive, user-composed workflow engine. Unlike `orchestration-graph.ts`
 * (whose channels are named per business step, known at compile time), a saved
 * definition's node IDs aren't known until it's loaded — LangGraph's `Annotation.Root`
 * has no API for synthesizing N channels from a runtime list, so every node writes into
 * one shared "blackboard" channel instead, keyed by nodeId. The reducer must
 * shallow-merge (not replace): two upstream nodes can finish in the same superstep when
 * a downstream node has multiple parents.
 */
const CustomWorkflowAnnotation = Annotation.Root({
  input: Annotation<string>(),
  caseId: Annotation<string | undefined>({ default: () => undefined, reducer: (_prev, next) => next }),
  blackboard: Annotation<Record<string, WorkflowRunNodeOutput>>({
    default: () => ({}),
    reducer: (prev, next) => ({ ...prev, ...next }),
  }),
  stepCount: Annotation<number>({ default: () => 0, reducer: (a, b) => a + b }),
});

type CustomWorkflowState = typeof CustomWorkflowAnnotation.State;

const buildNodeRunner = (node: WorkflowNode, onEvent: (event: WorkflowRunEvent) => void) =>
  async (state: CustomWorkflowState): Promise<Partial<CustomWorkflowState>> => {
    onEvent({ type: "node_start", nodeId: node.id, label: node.data.label });

    if (state.stepCount >= MAX_STEPS) {
      const message = `Đã chạm giới hạn ${MAX_STEPS} bước — dừng để tránh vòng lặp vô hạn.`;
      const output: WorkflowRunNodeOutput = {
        nodeId: node.id,
        label: node.data.label,
        status: "needs_review",
        text: message,
        citationIds: [],
        toolCalls: [],
        reasons: ["MAX_STEPS_EXCEEDED"],
      };
      onEvent({ type: "node_error", nodeId: node.id, message });
      return { blackboard: { [node.id]: output }, stepCount: 1 };
    }

    const { tools, executeTool } = buildToolsForNode(node.data, state.caseId);
    const upstreamText =
      Object.values(state.blackboard)
        .map(o => `[${o.label}] ${o.text}`)
        .join("\n") || "(chưa có node nào chạy trước)";

    try {
      const guarded = await runGuardedLlmCall({
        modelId: node.data.llm,
        systemPrompt:
          node.data.systemPrompt ||
          `Bạn là agent "${node.data.label}" (loại ${node.data.agentType}) trong một workflow do người dùng tự soạn. Trả lời ngắn gọn bằng tiếng Việt, chỉ gọi tool khi thật sự cần, và luôn kết thúc bằng cách gọi submit_output.`,
        userPrompt: `Yêu cầu ban đầu của người dùng:\n${state.input}\n\nKết quả các node đã chạy trước:\n${upstreamText}`,
        tools,
        executeTool,
        // "Free" agents are the autonomous, multi-tool-call type described in the
        // builder UI ("Tự động lặp lại và gọi Tool") — they get materially more
        // tool-calling iterations than Sequential/Semi-sequential nodes, which are meant
        // to be bounded single-shot reasoning steps.
        maxToolIterations: node.data.agentType === "Free" ? 10 : 3,
      });

      const output: WorkflowRunNodeOutput = {
        nodeId: node.id,
        label: node.data.label,
        status: guarded.status === "success" ? "success" : "needs_review",
        text: guarded.text,
        branch: guarded.branch,
        citationIds: guarded.citationIds,
        toolCalls: guarded.toolCalls,
        reasons: guarded.reasons,
      };

      if (output.status === "needs_review") {
        onEvent({ type: "node_error", nodeId: node.id, message: guarded.reasons.join("; ") || "NEEDS_REVIEW" });
      } else {
        onEvent({ type: "node_done", nodeId: node.id, output });
      }
      return { blackboard: { [node.id]: output }, stepCount: 1 };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown node execution error.";
      const output: WorkflowRunNodeOutput = {
        nodeId: node.id,
        label: node.data.label,
        status: "failed",
        text: message,
        citationIds: [],
        toolCalls: [],
        reasons: ["NODE_EXECUTION_ERROR"],
      };
      onEvent({ type: "node_error", nodeId: node.id, message });
      return { blackboard: { [node.id]: output }, stepCount: 1 };
    }
  };

const findEntryNodeId = (definition: WorkflowDefinition): string => {
  const targets = new Set(definition.edges.map(edge => edge.target));
  const entry = definition.nodes.find(node => !targets.has(node.id));
  if (!entry) {
    throw new Error("Workflow không có node bắt đầu hợp lệ (mọi node đều có cạnh đi vào — kiểm tra vòng lặp ở gốc).");
  }
  return entry.id;
};

const compileWorkflow = (definition: WorkflowDefinition, onEvent: (event: WorkflowRunEvent) => void) => {
  if (!definition.nodes.length) {
    throw new Error("Workflow rỗng, không có node nào để chạy.");
  }

  const builder = new StateGraph(CustomWorkflowAnnotation);
  for (const node of definition.nodes) {
    builder.addNode(node.id, buildNodeRunner(node, onEvent));
  }

  const entryNodeId = findEntryNodeId(definition);
  builder.addEdge(START, entryNodeId as never);

  for (const node of definition.nodes) {
    const outgoing = definition.edges.filter(edge => edge.source === node.id);
    if (!outgoing.length) {
      builder.addEdge(node.id as never, END);
      continue;
    }

    if (node.data.agentType === "Semi-sequential") {
      const branchMap: Record<string, string> = {};
      for (const edge of outgoing) {
        branchMap[edge.data?.branchValue ?? edge.target] = edge.target;
      }
      const defaultBranchKey = Object.keys(branchMap)[0];
      builder.addConditionalEdges(
        node.id as never,
        (state: CustomWorkflowState) => {
          const branch = state.blackboard[node.id]?.branch as string | undefined;
          return branch && branchMap[branch] ? branch : defaultBranchKey;
        },
        branchMap as never
      );
    } else {
      for (const edge of outgoing) {
        builder.addEdge(node.id as never, edge.target as never);
      }
    }
  }

  return builder.compile();
};

/**
 * Runs a saved workflow definition end to end. Uses `.invoke()` rather than `.stream()`
 * — unlike the retail-credit pipeline, per-node progress is reported precisely from
 * inside each node runner via `onEvent` at the moment it actually starts/finishes,
 * rather than inferred by diffing successive state snapshots.
 */
export const runWorkflow = async (
  definition: WorkflowDefinition,
  input: string,
  caseId: string | undefined,
  onEvent: (event: WorkflowRunEvent) => void
): Promise<void> => {
  const graph = compileWorkflow(definition, onEvent);
  const finalState = (await graph.invoke({ input, caseId })) as CustomWorkflowState;
  const nodeCount = Object.keys(finalState.blackboard).length;
  const failedCount = Object.values(finalState.blackboard).filter(o => o.status !== "success").length;
  onEvent({
    type: "final",
    summary:
      failedCount > 0
        ? `Workflow hoàn tất với ${nodeCount} node, trong đó ${failedCount} node cần soát xét/lỗi.`
        : `Workflow hoàn tất thành công với ${nodeCount} node.`,
  });
};
