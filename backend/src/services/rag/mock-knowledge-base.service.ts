export interface KnowledgeSource {
  id: string;
  title: string;
  tags: string[];
  content: string;
  citation: string;
}

const MOCK_KNOWLEDGE_BASE: KnowledgeSource[] = [
  {
    id: "WF-RETAIL-MORTGAGE-REFI",
    title: "Retail mortgage plus auto refinance workflow",
    tags: ["workflow", "planner", "mortgage", "refinance"],
    citation: "KB:WF-RETAIL-MORTGAGE-REFI",
    content:
      "Complex retail mortgage/refinance workflow requires profile normalization, product policy lookup, credit assessment, legal compliance, decision matrix, operations execution, and governance audit."
  },
  {
    id: "ROUTER-COMPLEX-RULES",
    title: "FAST vs COMPLEX routing rules",
    tags: ["planner", "routing"],
    citation: "KB:ROUTER-COMPLEX-RULES",
    content:
      "Requests involving future property, refinance, missing consent, insurance pricing, spouse/collateral issues, or multiple products must route to COMPLEX."
  },
  {
    id: "PROFILE-FIELD-MAP",
    title: "Retail profile field mapping",
    tags: ["profile", "documents", "classification"],
    citation: "KB:PROFILE-FIELD-MAP",
    content:
      "Parsed income, debt, consent, marital status, requested loan, and property fields map into the normalized CustomerProfileOutput contract. CCCD, account, phone, email, and address are restricted PII."
  },
  {
    id: "CREDIT-RULES-DEMO",
    title: "Demo credit rules",
    tags: ["credit", "rules", "dti", "ltv"],
    citation: "KB:CREDIT-RULES-DEMO",
    content:
      "Salary via SHB haircut is 0%; freelance income haircut is 50%; rental income haircut is 30%. DTI stress threshold is 60%, LTV threshold is 70%, and stress rate is 13.5% annual."
  },
  {
    id: "PRODUCT-HOME-AUTO",
    title: "Home loan and auto refinance product policies",
    tags: ["product", "policy", "pricing"],
    citation: "KB:PRODUCT-HOME-AUTO",
    content:
      "Future-home mortgage can be offered up to 30 years after eligibility review. Auto refinance can be bundled as a separate product. Preferential pricing must not require optional insurance purchase."
  },
  {
    id: "LEGAL-INSURANCE-TYING",
    title: "Insurance tying compliance rule",
    tags: ["legal", "insurance", "pricing"],
    citation: "KB:LEGAL-INSURANCE-TYING",
    content:
      "Preferential loan rate must not be conditioned on purchasing non-mandatory insurance. Approval must be blocked until pricing is reissued without the insurance dependency."
  },
  {
    id: "LEGAL-MARITAL-PROPERTY",
    title: "Marital property condition",
    tags: ["legal", "property", "marriage"],
    citation: "KB:LEGAL-MARITAL-PROPERTY",
    content:
      "Property acquired during marriage requires spouse signature on mortgage documents or evidence proving separate property before contract signing."
  },
  {
    id: "LEGAL-FUTURE-PROPERTY",
    title: "Future property disbursement condition",
    tags: ["legal", "future-property", "disbursement"],
    citation: "KB:LEGAL-FUTURE-PROPERTY",
    content:
      "Future-property disbursement requires acceptable project guarantee, lien release, or equivalent condition precedent before disbursement."
  },
  {
    id: "GOV-CONSENT-PII",
    title: "Consent and PII guardrails",
    tags: ["governance", "consent", "pii"],
    citation: "KB:GOV-CONSENT-PII",
    content:
      "External tax or social-insurance enrichment requires separate consent. Dashboard traces must mask CCCD, account number, phone, email, address, and CIC code."
  },
  {
    id: "RISK-MATRIX-PRIORITY",
    title: "Decision matrix priority",
    tags: ["risk", "decision"],
    citation: "KB:RISK-MATRIX-PRIORITY",
    content:
      "Schema invalid routes to human escalation. Legal approval blockers win. Credit fail without passing restructure rejects. Contract and disbursement conditions can produce conditional pass."
  },
  {
    id: "OPS-SIDE-EFFECTS",
    title: "Operations side-effect policy",
    tags: ["operations", "tools", "approval"],
    citation: "KB:OPS-SIDE-EFFECTS",
    content:
      "Create approval letter, LOS approval record, and core pending facility are high side-effect writes and require a human approval token. Draft checklist and notification are lower side-effect actions."
  }
];

export const queryMockKnowledgeBase = async (
  query: string,
  tags: string[] = []
): Promise<KnowledgeSource[]> => {
  const normalizedQuery = query.toLowerCase();
  const queryTokens = normalizedQuery.split(/[^a-z0-9]+/).filter(Boolean);

  const scored = MOCK_KNOWLEDGE_BASE.map((source) => {
    const tagScore = tags.filter((tag) => source.tags.includes(tag)).length * 3;
    const haystack = `${source.title} ${source.content} ${source.tags.join(" ")}`.toLowerCase();
    const tokenScore = queryTokens.filter((token) => haystack.includes(token)).length;
    return { source, score: tagScore + tokenScore };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ source }) => source);

  return scored.length > 0 ? scored : MOCK_KNOWLEDGE_BASE.slice(0, 2);
};

export const citationsFromSources = (sources: KnowledgeSource[]): string[] =>
  sources.map((source) => source.citation);

