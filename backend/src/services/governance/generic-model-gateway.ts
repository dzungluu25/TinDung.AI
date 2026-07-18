import OpenAI from "openai";
import { z } from "zod";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { getModelConfig } from "../../config/model-registry";
import { groundFindings, CitationCatalog } from "./citation-governance.service";
import citationCatalogJson from "../../policy/citation-catalog.json";

const catalog = citationCatalogJson as CitationCatalog;

/**
 * Any ruleId a generic workflow node cites resolves to a real catalog source: a specific
 * rule if one matches (e.g. a legal clause id), otherwise the internal-policy fallback.
 * This keeps "every LLM call must have citation" true and fail-closed for arbitrary
 * user-composed nodes without requiring a bespoke rule contract per workflow.
 */
const GENERIC_ALLOWED_RULE_IDS = [...Object.keys(catalog.ruleSources), "GENERIC_WORKFLOW_NODE"];
const genericResolveRuleId = (ruleId: string): string[] =>
  catalog.ruleSources[ruleId] ?? [catalog.fallbacks.internalPolicySourceId];

const NodeOutputSchema = z.object({
  text: z.string().min(1),
  branch: z.string().nullable(),
  ruleIds: z.array(z.string()).min(1),
});

const buildSubmitOutputTool = (allowedRuleIds: string[]): ChatCompletionTool => ({
  type: "function",
  function: {
    name: "submit_output",
    description:
      "Gửi kết quả cuối cùng của node. BẮT BUỘC phải gọi tool này để kết thúc, kèm ít nhất một ruleId làm căn cứ cho citation.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Nội dung/kết luận của node." },
        branch: {
          type: ["string", "null"],
          description: "Chỉ dùng cho node Semi-sequential: tên nhánh rẽ tiếp theo, hoặc null nếu không rẽ nhánh.",
        },
        ruleIds: {
          type: "array",
          items: { type: "string", enum: allowedRuleIds },
          minItems: 1,
          description: "Ít nhất 1 rule ID làm căn cứ cho kết luận — bắt buộc để hệ thống dựng citation phía server.",
        },
      },
      required: ["text", "branch", "ruleIds"],
      additionalProperties: false,
    },
  },
});

const clients = new Map<string, OpenAI>();

const getClient = (modelId: string): { client: OpenAI; modelName: string } => {
  const modelConfig = getModelConfig(modelId);
  if (!modelConfig || !modelConfig.apiKey) {
    throw new Error(`Model "${modelId}" is not configured (missing API key). Refusing to call an unconfigured model.`);
  }
  const cacheKey = `${modelConfig.baseUrl}::${modelConfig.apiKey}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = new OpenAI({ apiKey: modelConfig.apiKey, baseURL: modelConfig.baseUrl });
    clients.set(cacheKey, client);
  }
  return { client, modelName: modelConfig.modelName };
};

export interface GuardedToolCall {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: "success" | "failed";
}

export interface GuardedNodeOutput {
  status: "success" | "needs_review";
  text: string;
  branch: string | null;
  citationIds: string[];
  reasons: string[];
  toolCalls: GuardedToolCall[];
}

export interface GuardedLlmCallOptions {
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  tools?: ChatCompletionTool[];
  executeTool?: (name: string, input: Record<string, unknown>) => Promise<{ output: Record<string, unknown>; status: "success" | "failed" }>;
  maxRetries?: number;
  maxToolIterations?: number;
}

/**
 * Every LLM call made by the workflow-designer engine goes through this wrapper — no
 * node is allowed to call `client.chat.completions.create` directly. Forces a
 * `submit_output` tool call (same tool-forcing technique as legal-reasoning.service.ts),
 * validates it against a fixed Zod schema, grounds `ruleIds` into real citations via a
 * generalized `groundFindings`, and retries with a corrective message on schema or
 * citation failure. If still invalid after `maxRetries`, abstains with `NEEDS_REVIEW`
 * rather than silently passing bad output — never returns unvalidated model text.
 */
export const runGuardedLlmCall = async (options: GuardedLlmCallOptions): Promise<GuardedNodeOutput> => {
  const { client, modelName } = getClient(options.modelId);
  const submitTool = buildSubmitOutputTool(GENERIC_ALLOWED_RULE_IDS);
  const allTools = [...(options.tools ?? []), submitTool];
  const maxRetries = options.maxRetries ?? 2;
  const maxToolIterations = options.maxToolIterations ?? 6;
  const toolCallLog: GuardedToolCall[] = [];

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: options.systemPrompt },
    { role: "user", content: options.userPrompt },
  ];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let result: { text: string; branch: string | null; ruleIds: string[] } | undefined;

    for (let iteration = 0; iteration < maxToolIterations && !result; iteration++) {
      const response = await client.chat.completions.create({
        model: modelName,
        messages,
        tools: allTools,
        tool_choice: "auto",
      });
      const message = response.choices[0].message;
      messages.push(message);

      if (!message.tool_calls?.length) {
        messages.push({
          role: "user",
          content: "Bạn phải gọi tool submit_output để kết thúc, không được trả lời bằng văn bản thường.",
        });
        continue;
      }

      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") continue;
        const input = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;

        if (toolCall.function.name === "submit_output") {
          const parsed = NodeOutputSchema.safeParse(input);
          if (!parsed.success) {
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: `INVALID_SCHEMA: ${parsed.error.message}` });
            continue;
          }
          const invalidRule = parsed.data.ruleIds.find(r => !GENERIC_ALLOWED_RULE_IDS.includes(r));
          if (invalidRule) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `INVALID_RULE_ID: "${invalidRule}" is outside the allowed rule catalog.`,
            });
            continue;
          }
          result = parsed.data;
          break;
        }

        if (options.executeTool) {
          const { output, status } = await options.executeTool(toolCall.function.name, input);
          toolCallLog.push({ toolName: toolCall.function.name, input, output, status });
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(output) });
        } else {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` }),
          });
        }
      }
    }

    if (!result) {
      if (attempt === maxRetries) {
        return {
          status: "needs_review",
          text: "",
          branch: null,
          citationIds: [],
          reasons: ["NO_STRUCTURED_OUTPUT_AFTER_RETRIES"],
          toolCalls: toolCallLog,
        };
      }
      continue;
    }

    try {
      const grounded = groundFindings(
        [{ agent: "workflow-node", ruleIds: result.ruleIds, citations: [] as string[] }],
        { catalog, agentName: "workflow-node", resolveRuleId: genericResolveRuleId }
      );
      return {
        status: "success",
        text: result.text,
        branch: result.branch,
        citationIds: grounded[0].citations,
        reasons: [],
        toolCalls: toolCallLog,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "CITATION_GROUNDING_FAILED";
      if (attempt === maxRetries) {
        return { status: "needs_review", text: result.text, branch: result.branch, citationIds: [], reasons: [reason], toolCalls: toolCallLog };
      }
      messages.push({ role: "user", content: `Kết quả trước bị từ chối vì citation không hợp lệ: ${reason}. Hãy thử lại với ruleIds hợp lệ hơn.` });
    }
  }

  return { status: "needs_review", text: "", branch: null, citationIds: [], reasons: ["EXHAUSTED_RETRIES"], toolCalls: toolCallLog };
};
