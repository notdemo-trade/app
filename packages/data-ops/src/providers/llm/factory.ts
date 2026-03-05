import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import type {
	CompletionParams,
	CompletionResult,
	LLMClient,
	LLMProviderConfig,
	LLMProviderName,
} from '../../agents/llm/types';

type ProviderFactory = (config: { apiKey: string; baseUrl?: string }) => {
	languageModel: (modelId: string) => ReturnType<ReturnType<typeof createOpenAI>>;
};

const PROVIDER_FACTORIES: Record<LLMProviderName, ProviderFactory> = {
	openai: ({ apiKey, baseUrl }) => {
		const provider = createOpenAI({ apiKey, baseURL: baseUrl });
		return { languageModel: (id: string) => provider(id) };
	},
	anthropic: ({ apiKey, baseUrl }) => {
		const provider = createAnthropic({ apiKey, baseURL: baseUrl });
		return { languageModel: (id: string) => provider(id) };
	},
	google: ({ apiKey, baseUrl }) => {
		const provider = createGoogleGenerativeAI({ apiKey, baseURL: baseUrl });
		return { languageModel: (id: string) => provider(id) };
	},
	xai: ({ apiKey, baseUrl }) => {
		const provider = createXai({ apiKey, baseURL: baseUrl });
		return { languageModel: (id: string) => provider(id) };
	},
	deepseek: ({ apiKey, baseUrl }) => {
		const provider = createDeepSeek({ apiKey, baseURL: baseUrl });
		return { languageModel: (id: string) => provider(id) };
	},
};

export function createLLMProvider(config: LLMProviderConfig): LLMClient {
	const factory = PROVIDER_FACTORIES[config.provider];
	if (!factory) {
		throw new Error(`Unsupported LLM provider: ${config.provider}`);
	}

	const provider = factory({ apiKey: config.apiKey, baseUrl: config.baseUrl });
	const model = provider.languageModel(config.model);

	return {
		async complete(params: CompletionParams): Promise<CompletionResult> {
			const result = await generateText({
				model,
				messages: params.messages.map((m) => ({
					role: m.role,
					content: m.content,
				})),
				temperature: params.temperature,
				maxOutputTokens: params.max_tokens,
			});

			const inputTokens = result.usage.inputTokens ?? 0;
			const outputTokens = result.usage.outputTokens ?? 0;

			return {
				content: result.text,
				usage: {
					prompt_tokens: inputTokens,
					completion_tokens: outputTokens,
					total_tokens: inputTokens + outputTokens,
				},
			};
		},
	};
}
