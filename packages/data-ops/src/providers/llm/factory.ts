import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import type {
	CompletionParams,
	CompletionResult,
	LLMClient,
	LLMProviderConfig,
	LLMProviderName,
} from '../../agents/llm/types';

type ProviderFactory = (config: { apiKey?: string; baseUrl?: string; aiBinding?: unknown }) => {
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
	'workers-ai': ({ aiBinding }) => {
		const provider = createWorkersAI({ binding: aiBinding as Ai });
		return { languageModel: (id: string) => provider(id) };
	},
};

/** Returns a raw AI SDK LanguageModel for use with streamText/generateText. */
export function createLanguageModel(
	config: LLMProviderConfig,
): ReturnType<ReturnType<typeof createOpenAI>> {
	const factory = PROVIDER_FACTORIES[config.provider];
	if (!factory) {
		throw new Error(`Unsupported LLM provider: ${config.provider}`);
	}

	const provider = factory({
		apiKey: config.apiKey,
		baseUrl: config.baseUrl,
		aiBinding: config.aiBinding,
	});
	return provider.languageModel(config.model);
}

export function createLLMProvider(config: LLMProviderConfig): LLMClient {
	const factory = PROVIDER_FACTORIES[config.provider];
	if (!factory) {
		throw new Error(`Unsupported LLM provider: ${config.provider}`);
	}

	const provider = factory({
		apiKey: config.apiKey,
		baseUrl: config.baseUrl,
		aiBinding: config.aiBinding,
	});
	const model = provider.languageModel(config.model);

	return {
		async complete(params: CompletionParams): Promise<CompletionResult> {
			const wantJson = params.response_format?.type === 'json_object';
			const messages = params.messages.map((m) => ({
				role: m.role,
				content:
					wantJson && m.role === 'system'
						? `${m.content}\n\nYou MUST respond with valid JSON only. No markdown, no code fences.`
						: m.content,
			}));

			const result = await generateText({
				model,
				messages,
				temperature: params.temperature,
				maxOutputTokens: params.max_tokens,
				...(wantJson
					? {
							providerOptions: {
								openai: { response_format: { type: 'json_object' } },
								anthropic: { response_format: { type: 'json_object' } },
								google: { response_format: { type: 'json_object' } },
								xai: { response_format: { type: 'json_object' } },
								deepseek: { response_format: { type: 'json_object' } },
							},
						}
					: {}),
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
