import type { ScoreWindow } from '@repo/data-ops/agents/memory/types';
import { queryOptions, useQuery } from '@tanstack/react-query';
import {
	getOutcomeSnapshots,
	getPerformanceOutcomes,
	getPerformancePatterns,
	getPerformanceScores,
} from '@/core/functions/performance/direct';

const PERFORMANCE_REFETCH = {
	staleTime: 60_000,
	refetchInterval: 60_000,
	refetchIntervalInBackground: false,
	refetchOnWindowFocus: true,
} as const;

export const scoresQueryOptions = (windowDays?: ScoreWindow) =>
	queryOptions({
		queryKey: ['performance', 'scores', windowDays],
		queryFn: () => getPerformanceScores({ data: { window: windowDays } }),
		...PERFORMANCE_REFETCH,
	});

export const patternsQueryOptions = (personaId: string, symbol?: string) =>
	queryOptions({
		queryKey: ['performance', 'patterns', personaId, symbol],
		queryFn: () => getPerformancePatterns({ data: { personaId, symbol } }),
		enabled: !!personaId,
		...PERFORMANCE_REFETCH,
	});

export const outcomesQueryOptions = (status?: string) =>
	queryOptions({
		queryKey: ['performance', 'outcomes', status],
		queryFn: () => getPerformanceOutcomes({ data: { status } }),
		...PERFORMANCE_REFETCH,
	});

export const snapshotsQueryOptions = (outcomeId: string) =>
	queryOptions({
		queryKey: ['performance', 'snapshots', outcomeId],
		queryFn: () => getOutcomeSnapshots({ data: { outcomeId } }),
		enabled: !!outcomeId,
		staleTime: 30_000,
		refetchInterval: 30_000,
	});

export const useScores = (windowDays?: ScoreWindow) => useQuery(scoresQueryOptions(windowDays));
export const usePatterns = (personaId: string, symbol?: string) =>
	useQuery(patternsQueryOptions(personaId, symbol));
export const useOutcomes = (status?: string) => useQuery(outcomesQueryOptions(status));
export const useSnapshots = (outcomeId: string) => useQuery(snapshotsQueryOptions(outcomeId));
