import { config } from "./env";

export interface ModelRegistryEntry {
  id: string;
  label: string;
  configured: boolean;
}

interface ModelConfig {
  id: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
}

/**
 * Every model selectable from the workflow designer's "llm" dropdown must resolve to a
 * real, env-configured OpenAI-compatible endpoint. There is no aspirational/fake option:
 * an entry with no API key configured is reported as `configured: false` and the
 * generic model gateway refuses to call it (fail-closed), instead of silently
 * pretending an unconfigured brand name works.
 */
const MODEL_CONFIGS: ModelConfig[] = [
  {
    id: "fpt-gpt-oss-120b",
    label: "GPT-OSS-120B (FPT Marketplace)",
    apiKey: config.fptMarketplaceApiKey,
    baseUrl: config.fptMarketplaceBaseUrl,
    modelName: config.fptLegalModel,
  },
];

export const getModelRegistry = (): ModelRegistryEntry[] =>
  MODEL_CONFIGS.map(({ id, label, apiKey }) => ({ id, label, configured: Boolean(apiKey) }));

export const getModelConfig = (modelId: string): ModelConfig | undefined => MODEL_CONFIGS.find(m => m.id === modelId);
