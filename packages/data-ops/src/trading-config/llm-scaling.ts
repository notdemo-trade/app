export interface LLMTaskScale {
	temperatureScale: number;
	maxTokensScale: number;
	maxTokensMin: number;
	maxTokensMax: number;
}

export const LLM_TASK_SCALES = {
	trade_recommendation: {
		temperatureScale: 1.0,
		maxTokensScale: 0.8,
		maxTokensMin: 200,
		maxTokensMax: 4000,
	},
	research_report: {
		temperatureScale: 1.5,
		maxTokensScale: 2.0,
		maxTokensMin: 500,
		maxTokensMax: 4000,
	},
	event_classification: {
		temperatureScale: 1.0,
		maxTokensScale: 0.5,
		maxTokensMin: 200,
		maxTokensMax: 2000,
	},
	report_generation: {
		temperatureScale: 1.5,
		maxTokensScale: 2.0,
		maxTokensMin: 500,
		maxTokensMax: 4000,
	},
	persona_analysis: {
		temperatureScale: 1.2,
		maxTokensScale: 0.8,
		maxTokensMin: 200,
		maxTokensMax: 4000,
	},
	consensus_synthesis: {
		temperatureScale: 1.0,
		maxTokensScale: 1.0,
		maxTokensMin: 200,
		maxTokensMax: 4000,
	},
	risk_validation: {
		temperatureScale: 0.7,
		maxTokensScale: 0.6,
		maxTokensMin: 200,
		maxTokensMax: 4000,
	},
	debate_response: {
		temperatureScale: 1.5,
		maxTokensScale: 0.6,
		maxTokensMin: 200,
		maxTokensMax: 4000,
	},
} as const satisfies Record<string, LLMTaskScale>;

export type LLMTaskType = keyof typeof LLM_TASK_SCALES;

export function resolveTaskLLMParams(
	userTemperature: number,
	userMaxTokens: number,
	taskType: LLMTaskType,
): { temperature: number; maxTokens: number } {
	const scale = LLM_TASK_SCALES[taskType];
	return {
		temperature: Math.min(1.0, Math.max(0.0, userTemperature * scale.temperatureScale)),
		maxTokens: Math.min(
			scale.maxTokensMax,
			Math.max(scale.maxTokensMin, Math.round(userMaxTokens * scale.maxTokensScale)),
		),
	};
}
