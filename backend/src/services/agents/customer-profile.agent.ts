import { AgentTrace } from "../../types/trace.types";
import { mcpGetCustomer360, mcpCheckConsentScope } from "../../mcp/customer-tools.client";

/**
 * Customer 360 and consent-scope lookups now travel over a real MCP (Model Context
 * Protocol) stdio server (`mcp/customer-tools.server.ts`) instead of calling
 * `loadRetailCase` in-process — this agent is an MCP client, not a naming convention.
 */
export const runCustomerProfileAgent = async (
  runId: string,
  caseId: string
): Promise<AgentTrace> => {
  const startedAt = new Date().toISOString();

  const customer360 = await mcpGetCustomer360(caseId);

  if (!customer360) {
    return {
      id: `trace-profile-${Date.now()}`,
      runId,
      agent: "profile",
      task: "Retrieve and normalize customer profile",
      status: "failed",
      summary: `Không tìm thấy hồ sơ cho caseId: ${caseId}`,
      toolCalls: [],
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  const [creditConsent, taxConsent] = await Promise.all([
    mcpCheckConsentScope(caseId, "credit_check"),
    mcpCheckConsentScope(caseId, "tax_income_check")
  ]);

  const summary = `Đã tải thành công hồ sơ khách hàng qua MCP tool server (${customer360.demographic.age} tuổi, ${customer360.demographic.maritalStatus === "married" ? "Đã kết hôn" : "Độc thân"}). Đã chuẩn hóa nguồn thu nhập (${customer360.incomeSourceCount} nguồn) và nghĩa vụ nợ (${customer360.currentDebtCount} khoản nợ).`;

  return {
    id: `trace-profile-${Date.now()}`,
    runId,
    agent: "profile",
    task: "Retrieve and normalize customer profile",
    status: "completed",
    summary,
    toolCalls: [
      {
        toolName: "mcp.get_customer_360",
        input: { caseId },
        output: {
          customerId: customer360.customerId,
          demographic: customer360.demographic
        },
        status: "success"
      },
      {
        toolName: "mcp.check_consent_scope",
        input: { caseId, scopes: ["credit_check", "tax_income_check"] },
        output: { credit_check: creditConsent.granted, tax_income_check: taxConsent.granted },
        status: "success"
      }
    ],
    startedAt,
    completedAt: new Date().toISOString()
  };
};
