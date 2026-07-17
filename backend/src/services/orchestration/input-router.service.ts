import { RETAIL_CASES } from "../data/retail-case-data";
import { decisionPolicy, routingCatalog } from "../../config/policy";

export type InputErrorCode = "INVALID_INPUT" | "UNSUPPORTED_CASE" | "AMBIGUOUS_CASE";

export type InputRoutingResult =
  | { ok: true; caseId: string; score: number; matchedSignals: string[] }
  | { ok: false; code: InputErrorCode; message: string };

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export class OrchestrationInputError extends Error {
  constructor(public readonly code: InputErrorCode, message: string) {
    super(message);
    this.name = "OrchestrationInputError";
  }
}

/**
 * Routes only inputs that can be honestly represented by one of the demo fixtures.
 * Unknown input is rejected instead of silently falling back to a fully populated case.
 */
export const routeDemoInput = (prompt: unknown, requestedCaseId?: string): InputRoutingResult => {
  if (typeof prompt !== "string") {
    return { ok: false, code: "INVALID_INPUT", message: "Yêu cầu thẩm định phải là một chuỗi văn bản." };
  }

  const raw = prompt.trim();
  const text = normalize(raw);
  if (
    raw.length < decisionPolicy.routing.minimumPromptCharacters ||
    raw.length > decisionPolicy.routing.maximumPromptCharacters ||
    text.split(" ").length < decisionPolicy.routing.minimumPromptTokens
  ) {
    return { ok: false, code: "INVALID_INPUT", message: "Yêu cầu quá ngắn, quá dài hoặc không chứa đủ thông tin để thẩm định." };
  }

  const injection = routingCatalog.injectionSignals.find(signal => text.includes(signal));
  if (injection) {
    return { ok: true, caseId: routingCatalog.injectionCaseId, score: decisionPolicy.routing.exactMatchScore, matchedSignals: [injection] };
  }

  if (!routingCatalog.creditIntentSignals.some(signal => text.includes(signal))) {
    return { ok: false, code: "INVALID_INPUT", message: "Nội dung không phải yêu cầu thẩm định tín dụng." };
  }

  if (requestedCaseId) {
    return RETAIL_CASES[requestedCaseId]
      ? { ok: true, caseId: requestedCaseId, score: decisionPolicy.routing.exactMatchScore, matchedSignals: ["explicit-case-id"] }
      : { ok: false, code: "UNSUPPORTED_CASE", message: `caseId không tồn tại: ${requestedCaseId}.` };
  }

  const ranked = routingCatalog.cases
    .map(({ caseId, signals }) => {
      const matches = signals.filter(signal => text.includes(signal.text));
      return { caseId, score: matches.reduce((sum, signal) => sum + signal.weight, 0), matchedSignals: matches.map(signal => signal.text) };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < decisionPolicy.routing.minimumCaseMatchScore) {
    return {
      ok: false,
      code: "UNSUPPORTED_CASE",
      message: "Demo chưa có dữ liệu cấu trúc tương ứng với yêu cầu này. Hãy chọn một hồ sơ mẫu hoặc truyền caseId hợp lệ.",
    };
  }
  if (ranked[1] && best.score - ranked[1].score < decisionPolicy.routing.minimumWinnerMargin) {
    return { ok: false, code: "AMBIGUOUS_CASE", message: "Yêu cầu khớp nhiều hồ sơ mẫu. Vui lòng chọn rõ một case hoặc bổ sung thông tin." };
  }

  return { ok: true, caseId: best.caseId, score: best.score, matchedSignals: best.matchedSignals };
};

export const requireDemoInput = (prompt: unknown, requestedCaseId?: string): Extract<InputRoutingResult, { ok: true }> => {
  const result = routeDemoInput(prompt, requestedCaseId);
  if (!result.ok) throw new OrchestrationInputError(result.code, result.message);
  return result;
};
