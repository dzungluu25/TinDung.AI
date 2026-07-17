import { KnowledgeSource, queryMockKnowledgeBase } from "./mock-knowledge-base.service";

export const queryLegalRequirements = async (query: string): Promise<KnowledgeSource[]> =>
  queryMockKnowledgeBase(query, ["legal", "governance"]);
