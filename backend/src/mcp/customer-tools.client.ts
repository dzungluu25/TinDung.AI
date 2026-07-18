import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * MCP client that spawns `customer-tools.server.ts` (or its compiled `.js` in `dist/`)
 * as a child process and talks to it over the real MCP stdio transport. Connection is
 * established lazily on first tool call and reused for the lifetime of the process, so
 * importing this module has no side effect (kept safe for `test-core.ts`, which never
 * calls these functions).
 */
let clientPromise: Promise<Client> | null = null;

const isCompiled = __filename.endsWith(".js");

const buildTransport = (): StdioClientTransport => {
  if (isCompiled) {
    return new StdioClientTransport({
      command: process.execPath,
      args: [path.join(__dirname, "customer-tools.server.js")],
    });
  }
  return new StdioClientTransport({
    command: process.execPath,
    args: ["-r", "ts-node/register/transpile-only", path.join(__dirname, "customer-tools.server.ts")],
  });
};

const getClient = async (): Promise<Client> => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client({ name: "vaic-backend-mcp-client", version: "1.0.0" });
      await client.connect(buildTransport());
      return client;
    })().catch(error => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
};

const callJsonTool = async <T>(toolName: string, args: Record<string, unknown>): Promise<T> => {
  const client = await getClient();
  const result = await client.callTool({ name: toolName, arguments: args });
  const content = Array.isArray(result.content) ? result.content : [];
  const textPart = content.find(
    (part): part is { type: "text"; text: string } => (part as { type?: string }).type === "text"
  );
  if (!textPart) {
    throw new Error(`MCP tool "${toolName}" returned no text content.`);
  }
  return JSON.parse(textPart.text) as T;
};

export interface McpCustomer360 {
  customerId: string;
  demographic: { name: string; age: number; maritalStatus: "single" | "married" };
  incomeSourceCount: number;
  currentDebtCount: number;
}

export interface McpConsentCheck {
  scope: "credit_check" | "tax_income_check";
  granted: boolean;
}

export const mcpGetCustomer360 = (caseId: string): Promise<McpCustomer360 | null> =>
  callJsonTool<McpCustomer360 | null>("get_customer_360", { caseId });

export const mcpCheckConsentScope = (
  caseId: string,
  scope: "credit_check" | "tax_income_check"
): Promise<McpConsentCheck> => callJsonTool<McpConsentCheck>("check_consent_scope", { caseId, scope });
