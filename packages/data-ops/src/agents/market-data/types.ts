import type { Bar, Timeframe } from '../ta/types';

export interface MarketDataFetchParams {
	symbol: string;
	timeframe: Timeframe;
	start?: string;
	end?: string;
	limit?: number;
}

export interface MarketDataResult {
	symbol: string;
	timeframe: Timeframe;
	bars: Bar[];
	fetchedAt: number;
}

export interface AlpacaMarketDataAgentState {
	lastFetchAt: number | null;
	barCount: number;
	errorCount: number;
	lastError: string | null;
}
