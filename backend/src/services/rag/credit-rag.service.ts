import { KnowledgeSource, queryMockKnowledgeBase } from "./mock-knowledge-base.service";

export const queryCreditPolicies = async (query: string): Promise<KnowledgeSource[]> =>
  queryMockKnowledgeBase(query, ["credit", "rules"]);
