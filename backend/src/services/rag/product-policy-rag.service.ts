import { KnowledgeSource, queryMockKnowledgeBase } from "./mock-knowledge-base.service";

export const queryProductPolicies = async (query: string): Promise<KnowledgeSource[]> =>
  queryMockKnowledgeBase(query, ["product", "policy", "pricing"]);
