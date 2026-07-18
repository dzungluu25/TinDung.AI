import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadRetailCase } from "../services/data/retail-case-loader";

/**
 * Real MCP (Model Context Protocol) tool server — replaces the `mcp://...` naming
 * convention used in the planning docs with an actual JSON-RPC-over-stdio server that
 * exposes retail-case tools. Runs as a child process spawned by
 * `customer-tools.client.ts`; every call below travels over the MCP wire protocol, not
 * a direct in-process function call.
 */
const server = new McpServer({ name: "shb-retail-customer-tools", version: "1.0.0" });

server.registerTool(
  "get_customer_360",
  {
    title: "Get Retail Customer 360",
    description:
      "Loads the normalized customer profile (demographic summary, income source count, existing debt count) for a retail credit case.",
    inputSchema: { caseId: z.string() },
  },
  async ({ caseId }) => {
    const retailCase = await loadRetailCase(caseId);
    const payload = retailCase
      ? {
          customerId: retailCase.customerId,
          demographic: {
            name: retailCase.demographic.name,
            age: retailCase.demographic.age,
            maritalStatus: retailCase.demographic.maritalStatus,
          },
          incomeSourceCount: retailCase.incomeSources.length,
          currentDebtCount: retailCase.currentDebts.length,
        }
      : null;
    return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
  }
);

server.registerTool(
  "check_consent_scope",
  {
    title: "Check Consent Registry Scope",
    description:
      "Checks whether the customer has granted consent for a specific external-data scope (credit_check or tax_income_check) before any third-party lookup runs.",
    inputSchema: {
      caseId: z.string(),
      scope: z.enum(["credit_check", "tax_income_check"]),
    },
  },
  async ({ caseId, scope }) => {
    const retailCase = await loadRetailCase(caseId);
    const granted = retailCase ? Boolean(retailCase.consent[scope]) : false;
    return { content: [{ type: "text" as const, text: JSON.stringify({ scope, granted }) }] };
  }
);

const transport = new StdioServerTransport();
void server.connect(transport);
