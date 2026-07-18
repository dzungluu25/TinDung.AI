import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { mcpGetCustomer360, mcpCheckConsentScope } from "../../mcp/customer-tools.client";
import { queryProjectGuarantee, queryRegulationClause } from "../rag/policy-rag.service";
import { WorkflowNodeData } from "../../types/workflow.types";

/** Same allowlist the audited Legal agent already uses — GraphRAG lookups from a
 * user-composed node stay bounded to real, known clauses instead of accepting an
 * arbitrary node-config string as a Cypher parameter. */
const ALLOWED_CLAUSE_IDS = [
  "Clause-Insurance-Tying",
  "Clause-Marital-Property",
  "Clause-Future-Property",
  "Clause-Loan-Purpose",
  "Clause-DTI-Limit",
  "Clause-LTV-Limit",
  "Clause-Tenure-Limit",
  "Clause-CIC-History",
];

type ToolResult = { output: Record<string, unknown>; status: "success" | "failed" };

export interface ToolBinding {
  tools: ChatCompletionTool[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Maps a workflow node's `mcp`/`knowledge` choice to real, callable tools:
 * - `mcp: "credit"` -> the real MCP server in `mcp/customer-tools.server.ts`.
 * - `knowledge: "graphrag"` -> the real Neo4j queries in `rag/policy-rag.service.ts`.
 * - `mcp: "legal"` and `knowledge: "faiss"` have no real backing infrastructure yet
 *   (see AUDIT_REPORT R02) and are intentionally left with no tools registered so a
 *   node configured this way fails closed instead of returning fabricated data.
 */
export const buildToolsForNode = (data: WorkflowNodeData, caseId: string | undefined): ToolBinding => {
  const tools: ChatCompletionTool[] = [];
  const handlers = new Map<string, (input: Record<string, unknown>) => Promise<ToolResult>>();

  if (data.mcp === "credit") {
    tools.push({
      type: "function",
      function: {
        name: "get_customer_360",
        description: "Lấy hồ sơ khách hàng 360 qua MCP tool server thật (demographic, số nguồn thu nhập, số khoản nợ).",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    });
    handlers.set("get_customer_360", async () => {
      if (!caseId) return { output: { error: "No caseId bound to this run." }, status: "failed" };
      const result = await mcpGetCustomer360(caseId);
      return { output: (result as unknown as Record<string, unknown>) ?? { found: false }, status: "success" };
    });

    tools.push({
      type: "function",
      function: {
        name: "check_consent_scope",
        description: "Kiểm tra consent (credit_check hoặc tax_income_check) qua MCP tool server thật trước khi tra cứu dữ liệu bên thứ ba.",
        parameters: {
          type: "object",
          properties: { scope: { type: "string", enum: ["credit_check", "tax_income_check"] } },
          required: ["scope"],
          additionalProperties: false,
        },
      },
    });
    handlers.set("check_consent_scope", async input => {
      if (!caseId) return { output: { error: "No caseId bound to this run." }, status: "failed" };
      const scope = input.scope as "credit_check" | "tax_income_check";
      const result = await mcpCheckConsentScope(caseId, scope);
      return { output: result as unknown as Record<string, unknown>, status: "success" };
    });
  }

  if (data.knowledge === "graphrag") {
    tools.push({
      type: "function",
      function: {
        name: "get_regulation_clause",
        description: "Tra cứu điều khoản pháp lý thật trong đồ thị tri thức Neo4j (GraphRAG). Chỉ dùng clauseId trong danh sách cho phép.",
        parameters: {
          type: "object",
          properties: { clauseId: { type: "string", enum: ALLOWED_CLAUSE_IDS } },
          required: ["clauseId"],
          additionalProperties: false,
        },
      },
    });
    handlers.set("get_regulation_clause", async input => {
      const clause = await queryRegulationClause(input.clauseId as string);
      return { output: clause ? ({ ...clause, found: true } as unknown as Record<string, unknown>) : { found: false }, status: "success" };
    });

    tools.push({
      type: "function",
      function: {
        name: "get_project_guarantee_status",
        description: "Tra cứu trạng thái bảo lãnh dự án hình thành trong tương lai thật trong Neo4j (GraphRAG), theo projectCode.",
        parameters: {
          type: "object",
          properties: { projectCode: { type: "string" } },
          required: ["projectCode"],
          additionalProperties: false,
        },
      },
    });
    handlers.set("get_project_guarantee_status", async input => {
      const project = await queryProjectGuarantee(input.projectCode as string);
      return { output: project ? ({ ...project, found: true } as unknown as Record<string, unknown>) : { found: false }, status: "success" };
    });
  }

  if (data.knowledge === "faiss") {
    tools.push({
      type: "function",
      function: {
        name: "vector_search",
        description: "KHÔNG DÙNG: FAISS/vector DB chưa được provision trong môi trường này.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    });
    handlers.set("vector_search", async () => ({
      output: { error: "NOT_CONFIGURED: no vector database is provisioned in this environment." },
      status: "failed",
    }));
  }

  const executeTool = async (name: string, input: Record<string, unknown>): Promise<ToolResult> => {
    const handler = handlers.get(name);
    if (!handler) return { output: { error: `Unknown tool: ${name}` }, status: "failed" };
    return handler(input);
  };

  return { tools, executeTool };
};
