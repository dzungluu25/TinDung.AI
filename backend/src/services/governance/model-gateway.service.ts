import { config } from "../../config/env";
import { ModelGatewayRequest, ModelGatewayResponse } from "../../types/domain.types";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: Record<string, unknown>;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const buildChatCompletionsUrl = (): string => {
  const baseUrl = trimTrailingSlash(config.fptBaseUrl);
  return `${baseUrl}/chat/completions`;
};

export const callModelThroughGateway = async (
  request: ModelGatewayRequest
): Promise<ModelGatewayResponse> => {
  if (!config.modelGatewayEnabled) {
    return {
      content: request.fallback,
      model: config.fptModel,
      provider: "fpt-ai-marketplace",
      usedFallback: true,
      error: "Model gateway disabled by MODEL_GATEWAY_ENABLED=false"
    };
  }

  if (!config.fptApiKey) {
    return {
      content: request.fallback,
      model: config.fptModel,
      provider: "fpt-ai-marketplace",
      usedFallback: true,
      error: "FPT_API_KEY is not configured"
    };
  }

  try {
    const response = await fetch(buildChatCompletionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.fptApiKey}`,
        "api-key": config.fptApiKey
      },
      body: JSON.stringify({
        model: config.fptModel,
        messages: [
          {
            role: "system",
            content: request.systemPrompt
          },
          {
            role: "user",
            content: request.userPrompt
          }
        ],
        temperature: request.temperature ?? 0,
        max_tokens: request.maxTokens ?? 500,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: request.fallback,
        model: config.fptModel,
        provider: "fpt-ai-marketplace",
        usedFallback: true,
        error: `FPT AI Marketplace returned ${response.status}: ${errorText.slice(0, 300)}`
      };
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return {
        content: request.fallback,
        model: config.fptModel,
        provider: "fpt-ai-marketplace",
        usedFallback: true,
        error: "FPT AI Marketplace response did not include choices[0].message.content",
        usage: data.usage
      };
    }

    const missingRequiredTerm = request.requiredTerms?.find((term) => !content.includes(term));
    if (missingRequiredTerm) {
      return {
        content: request.fallback,
        model: config.fptModel,
        provider: "fpt-ai-marketplace",
        usedFallback: true,
        error: `Model response omitted required term: ${missingRequiredTerm}`,
        usage: data.usage
      };
    }

    return {
      content,
      model: config.fptModel,
      provider: "fpt-ai-marketplace",
      usedFallback: false,
      usage: data.usage
    };
  } catch (error) {
    return {
      content: request.fallback,
      model: config.fptModel,
      provider: "fpt-ai-marketplace",
      usedFallback: true,
      error: error instanceof Error ? error.message : "Unknown model gateway error"
    };
  }
};
