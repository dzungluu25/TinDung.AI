import { decisionPolicy } from "../../config/policy";
import { RetailCase } from "../../types/case.types";
import { extractCaseFromPrompt } from "./case-extraction.service";
import { loadRetailCase, saveRetailCase } from "../data/retail-case-loader";
import { assertPersistedRetailCase } from "../data/data-integrity.service";
import { randomUUID } from "crypto";

export type InputErrorCode = "INVALID_INPUT" | "UNSUPPORTED_CASE" | "AMBIGUOUS_CASE" | "NEEDS_MORE_INFO" | "DATA_SOURCE_UNAVAILABLE";

export type InputRoutingResult =
  | { ok: true; caseId: string; score: number; matchedSignals: string[] }
  | { ok: false; code: InputErrorCode; message: string };

/**
 * Same shape as InputRoutingResult, plus an optional dynamically-extracted case and a
 * `questions` list when the extraction model needs more information instead.
 */
export type InputRoutingOrExtractionResult =
  | { ok: true; caseId: string; score: number; matchedSignals: string[]; extractedCase?: RetailCase }
  | { ok: false; code: InputErrorCode; message: string; questions?: string[] };

export class OrchestrationInputError extends Error {
  constructor(public readonly code: InputErrorCode, message: string, public readonly questions?: string[]) {
    super(message);
    this.name = "OrchestrationInputError";
  }
}

/**
 * Validates only the prompt shape. Intent classification and security screening happen
 * before this router; case extraction is model-based rather than keyword-based.
 */
const screenInput = (prompt: unknown): { ok: true } | { ok: false; code: InputErrorCode; message: string } => {
  if (typeof prompt !== "string") {
    return { ok: false, code: "INVALID_INPUT", message: "Yêu cầu thẩm định phải là một chuỗi văn bản." };
  }

  const raw = prompt.trim();
  if (
    raw.length < decisionPolicy.routing.minimumPromptCharacters ||
    raw.length > decisionPolicy.routing.maximumPromptCharacters ||
    raw.split(/\s+/).length < decisionPolicy.routing.minimumPromptTokens
  ) {
    return { ok: false, code: "INVALID_INPUT", message: "Yêu cầu quá ngắn, quá dài hoặc không chứa đủ thông tin để thẩm định." };
  }

  return { ok: true };
};

const randomCaseId = (): string => `case-${randomUUID()}`;

/**
 * Resolves a caseId for this request. An explicit requestedCaseId must exist in the DB;
 * otherwise the extraction model builds a fresh RetailCase from the supplied facts and
 * persists it. No prompt is mapped to a canned case fixture.
 */
export const routeOrExtractInput = async (
  prompt: unknown,
  requestedCaseId?: string,
  tenantId = "bank-default"
): Promise<InputRoutingOrExtractionResult> => {
  const screened = screenInput(prompt);
  if (!screened.ok) return screened;

  if (requestedCaseId) {
    const existing = await loadRetailCase(requestedCaseId, tenantId);
    return existing
      ? { ok: true, caseId: requestedCaseId, score: decisionPolicy.routing.exactMatchScore, matchedSignals: ["explicit-case-id"], extractedCase: existing }
      : { ok: false, code: "UNSUPPORTED_CASE", message: `caseId không tồn tại: ${requestedCaseId}.` };
  }

  const extraction = await extractCaseFromPrompt((prompt as string).trim());
  if (!extraction.ok) {
    return {
      ok: false,
      code: "NEEDS_MORE_INFO",
      message: "Nội dung chưa đủ thông tin để dựng hồ sơ tín dụng. Vui lòng bổ sung các thông tin còn thiếu.",
      questions: extraction.questions,
    };
  }

  const caseId = randomCaseId();
  const retailCase: RetailCase = { caseId, customerId: `dyn-${caseId}`, ...extraction.retailCase };
  try {
    await saveRetailCase(retailCase, tenantId);
    const persistedCase = await loadRetailCase(caseId, tenantId);
    if (!persistedCase) {
      return {
        ok: false,
        code: "DATA_SOURCE_UNAVAILABLE",
        message: "Hồ sơ đã được trích xuất nhưng chưa thể xác nhận trong nguồn dữ liệu dùng chung; quy trình dừng trước khi gọi các agent.",
      };
    }
    assertPersistedRetailCase(retailCase, persistedCase);
    return { ok: true, caseId, score: decisionPolicy.routing.exactMatchScore, matchedSignals: ["llm-extracted"], extractedCase: persistedCase };
  } catch (error) {
    console.error(`Failed to persist extracted retail case ${caseId}:`, error);
    return {
      ok: false,
      code: "DATA_SOURCE_UNAVAILABLE",
      message: "Không thể lưu và xác minh hồ sơ trong nguồn dữ liệu dùng chung; quy trình chưa gọi MCP hoặc agent nghiệp vụ.",
    };
  }
};
