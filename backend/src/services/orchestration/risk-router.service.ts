import { OrchestrationRequest } from "../../types/orchestration.types";

const COMPLEX_KEYWORDS = [
  "future",
  "formed in the future",
  "hinh thanh trong tuong lai",
  "refinance",
  "tai tai tro",
  "auto",
  "car",
  "insurance",
  "bao hiem",
  "spouse",
  "married",
  "collateral",
  "consent",
  "mortgage",
  "home loan",
  "can ho"
];

export const detectRiskTier = (input: OrchestrationRequest): "FAST" | "COMPLEX" => {
  const prompt = input.prompt.toLowerCase();
  if (prompt.includes("fast") || prompt.includes("simple") || prompt.includes("clean")) {
    return "FAST";
  }
  return COMPLEX_KEYWORDS.some((keyword) => prompt.includes(keyword)) ? "COMPLEX" : "FAST";
};

