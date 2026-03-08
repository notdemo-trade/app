import type { TradingConfig } from '../../trading-config/schema';
import type { LLMProviderName, StrategyTemplate } from '../llm/types';
import { DEFAULT_SESSION_CONFIG } from './defaults';
import type { EffectiveConfig, SessionConfig } from './types';

export interface ConfigSources {
	tradingConfig: TradingConfig | null;
	sessionConfig: SessionConfig;
	activeStrategy: StrategyTemplate | null;
}

export function resolveEffectiveConfig(sources: ConfigSources): EffectiveConfig {
	const { tradingConfig, sessionConfig, activeStrategy } = sources;
	const _sources: Record<string, EffectiveConfig['_sources'][string]> = {};

	// --- Position sizing ---
	// Priority: tradingConfig > sessionConfig (if explicitly changed) > strategy > default
	let positionSizePctOfCash: number;
	if (tradingConfig?.positionSizePctOfCash !== undefined) {
		positionSizePctOfCash = tradingConfig.positionSizePctOfCash;
		_sources['positionSizePctOfCash'] = 'trading_config';
	} else if (sessionConfig.positionSizePctOfCash !== DEFAULT_SESSION_CONFIG.positionSizePctOfCash) {
		positionSizePctOfCash = sessionConfig.positionSizePctOfCash;
		_sources['positionSizePctOfCash'] = 'session_config';
	} else if (activeStrategy?.positionSizeBias) {
		positionSizePctOfCash = activeStrategy.positionSizeBias;
		_sources['positionSizePctOfCash'] = 'strategy_profile';
	} else {
		positionSizePctOfCash = DEFAULT_SESSION_CONFIG.positionSizePctOfCash;
		_sources['positionSizePctOfCash'] = 'default';
	}

	// --- LLM provider/model ---
	// Priority: tradingConfig.analystModel > sessionConfig > default
	let llmProvider = sessionConfig.llmProvider;
	let llmModel = sessionConfig.llmModel;
	_sources['llmProvider'] = 'session_config';
	_sources['llmModel'] = 'session_config';

	if (tradingConfig?.analystModel) {
		const parsed = parseModelString(tradingConfig.analystModel);
		if (parsed) {
			llmProvider = parsed.provider;
			llmModel = parsed.model;
			_sources['llmProvider'] = 'trading_config';
			_sources['llmModel'] = 'trading_config';
		}
	}

	// --- Risk management fields (from trading config, with defaults) ---
	const maxPositionValue = tradingConfig?.maxPositionValue ?? 5000;
	const maxPositions = tradingConfig?.maxPositions ?? 10;
	const maxNotionalPerTrade = tradingConfig?.maxNotionalPerTrade ?? 5000;
	const maxDailyLossPct = tradingConfig?.maxDailyLossPct ?? 0.02;
	const takeProfitPct = tradingConfig?.takeProfitPct ?? 0.15;
	const stopLossPct = tradingConfig?.stopLossPct ?? 0.08;
	const cooldownMinutesAfterLoss = tradingConfig?.cooldownMinutesAfterLoss ?? 30;
	const tradingHoursOnly = tradingConfig?.tradingHoursOnly ?? true;
	const extendedHoursAllowed = tradingConfig?.extendedHoursAllowed ?? false;
	const allowShortSelling = tradingConfig?.allowShortSelling ?? false;
	const tickerBlacklist = tradingConfig?.tickerBlacklist ?? [];
	const tickerAllowlist = tradingConfig?.tickerAllowlist ?? null;

	for (const field of [
		'maxPositionValue',
		'maxPositions',
		'maxNotionalPerTrade',
		'maxDailyLossPct',
		'takeProfitPct',
		'stopLossPct',
		'cooldownMinutesAfterLoss',
		'tradingHoursOnly',
		'extendedHoursAllowed',
		'allowShortSelling',
		'tickerBlacklist',
		'tickerAllowlist',
	]) {
		_sources[field] =
			tradingConfig?.[field as keyof TradingConfig] !== undefined ? 'trading_config' : 'default';
	}

	return {
		positionSizePctOfCash,
		llmProvider,
		llmModel,
		maxPositionValue,
		maxPositions,
		maxNotionalPerTrade,
		maxDailyLossPct,
		takeProfitPct,
		stopLossPct,
		cooldownMinutesAfterLoss,
		tradingHoursOnly,
		extendedHoursAllowed,
		allowShortSelling,
		tickerBlacklist,
		tickerAllowlist,

		// Phase 23: Extended settings (PG trading config takes priority over session config)
		proposalTimeoutSec: tradingConfig?.proposalTimeoutSec ?? sessionConfig.proposalTimeoutSec,
		llmTemperature: (tradingConfig?.llmTemperature as number) ?? 0.3,
		llmMaxTokens: (tradingConfig?.llmMaxTokens as number) ?? 1000,
		scoreWindows: (tradingConfig?.scoreWindows as number[]) ?? [30, 90, 180],
		confidenceDisplayHigh: (tradingConfig?.confidenceDisplayHigh as number) ?? 0.7,
		confidenceDisplayMed: (tradingConfig?.confidenceDisplayMed as number) ?? 0.4,

		// Session-specific (pass through)
		orchestrationMode: sessionConfig.orchestrationMode,
		brokerType: sessionConfig.brokerType,
		watchlistSymbols: sessionConfig.watchlistSymbols,
		analysisIntervalSec: sessionConfig.analysisIntervalSec,
		minConfidenceThreshold: sessionConfig.minConfidenceThreshold,
		activeStrategyId: sessionConfig.activeStrategyId,
		debateRounds: sessionConfig.debateRounds,

		_sources,
	};
}

export function parseModelString(
	modelStr: string,
): { provider: LLMProviderName; model: string } | null {
	const slashIdx = modelStr.indexOf('/');
	if (slashIdx === -1) return null;

	const provider = modelStr.slice(0, slashIdx);
	const model = modelStr.slice(slashIdx + 1);

	const validProviders: string[] = [
		'openai',
		'anthropic',
		'google',
		'xai',
		'deepseek',
		'workers-ai',
	];
	if (!validProviders.includes(provider)) return null;

	return { provider: provider as LLMProviderName, model };
}
