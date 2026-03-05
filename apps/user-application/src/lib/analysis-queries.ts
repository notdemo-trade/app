import type { Timeframe } from '@repo/data-ops/agents/ta/types';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { getAnalysis, getBatchAnalysis } from '@/core/functions/analysis/direct';

export const analysisQueryOptions = (symbol: string, timeframe: Timeframe = '1Day') =>
	queryOptions({
		queryKey: ['analysis', symbol, timeframe],
		queryFn: () => getAnalysis({ data: { symbol, timeframe } }),
		staleTime: 60_000,
		refetchInterval: 60_000,
	});

export const batchAnalysisQueryOptions = (symbols: string[], timeframe: Timeframe = '1Day') =>
	queryOptions({
		queryKey: ['analysis', 'batch', symbols, timeframe],
		queryFn: () => getBatchAnalysis({ data: { symbols, timeframe } }),
		staleTime: 60_000,
		enabled: symbols.length > 0,
	});

export const useAnalysis = (symbol: string, timeframe: Timeframe = '1Day') =>
	useQuery(analysisQueryOptions(symbol, timeframe));

export const useBatchAnalysis = (symbols: string[], timeframe: Timeframe = '1Day') =>
	useQuery(batchAnalysisQueryOptions(symbols, timeframe));
