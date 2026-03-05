interface ModelPricing {
	promptPer1M: number;
	completionPer1M: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
	'gpt-4o': { promptPer1M: 2.5, completionPer1M: 10 },
	'gpt-4o-mini': { promptPer1M: 0.15, completionPer1M: 0.6 },
	'gpt-4-turbo': { promptPer1M: 10, completionPer1M: 30 },
	'gpt-4': { promptPer1M: 30, completionPer1M: 60 },
	'gpt-3.5-turbo': { promptPer1M: 0.5, completionPer1M: 1.5 },
	o1: { promptPer1M: 15, completionPer1M: 60 },
	'o1-mini': { promptPer1M: 3, completionPer1M: 12 },
	'o3-mini': { promptPer1M: 1.1, completionPer1M: 4.4 },
	'claude-sonnet-4-20250514': { promptPer1M: 3, completionPer1M: 15 },
	'claude-3-5-sonnet-20241022': { promptPer1M: 3, completionPer1M: 15 },
	'claude-3-5-haiku-20241022': { promptPer1M: 0.8, completionPer1M: 4 },
	'claude-3-opus-20240229': { promptPer1M: 15, completionPer1M: 75 },
	'claude-opus-4-20250514': { promptPer1M: 15, completionPer1M: 75 },
	'gemini-2.0-flash': { promptPer1M: 0.1, completionPer1M: 0.4 },
	'gemini-1.5-pro': { promptPer1M: 1.25, completionPer1M: 5 },
	'gemini-1.5-flash': { promptPer1M: 0.075, completionPer1M: 0.3 },
	'grok-2': { promptPer1M: 2, completionPer1M: 10 },
	'grok-beta': { promptPer1M: 5, completionPer1M: 15 },
	'deepseek-chat': { promptPer1M: 0.14, completionPer1M: 0.28 },
	'deepseek-reasoner': { promptPer1M: 0.55, completionPer1M: 2.19 },
};

const DEFAULT_PRICING: ModelPricing = { promptPer1M: 5, completionPer1M: 15 };

export function estimateCost(
	model: string,
	promptTokens: number,
	completionTokens: number,
): number {
	const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
	const promptCost = (promptTokens / 1_000_000) * pricing.promptPer1M;
	const completionCost = (completionTokens / 1_000_000) * pricing.completionPer1M;
	return Math.round((promptCost + completionCost) * 1_000_000) / 1_000_000;
}

export function getModelPricing(model: string): ModelPricing {
	return MODEL_PRICING[model] ?? DEFAULT_PRICING;
}
