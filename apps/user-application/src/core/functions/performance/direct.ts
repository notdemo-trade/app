import type {
	OutcomeSnapshot,
	PersonaPattern,
	PersonaScore,
	PipelineScore,
	ProposalOutcome,
} from '@repo/data-ops/agents/memory/types';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { AppError } from '@/core/errors';
import { protectedFunctionMiddleware } from '@/core/middleware/auth';
import { fetchDataService } from '@/lib/data-service';

interface ScoresResponse {
	data: {
		mode: 'debate' | 'pipeline' | 'none';
		scores: PersonaScore[] | PipelineScore[];
	};
}

interface PatternsResponse {
	data: PersonaPattern[];
}

interface OutcomesResponse {
	data: ProposalOutcome[];
}

interface SnapshotsResponse {
	data: OutcomeSnapshot[];
}

export const getPerformanceScores = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ window: z.number().optional() }))
	.handler(async ({ data, context }) => {
		const params = new URLSearchParams();
		if (data.window) params.set('window', String(data.window));
		const qs = params.toString();
		const res = await fetchDataService(`/api/performance/scores${qs ? `?${qs}` : ''}`, {
			headers: { 'X-Internal-User-Id': context.userId },
		});
		if (!res.ok) {
			const body = await res.text();
			throw new AppError(`Failed to fetch scores: ${body}`, res.status);
		}
		const json: ScoresResponse = await res.json();
		return json.data;
	});

export const getPerformancePatterns = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ personaId: z.string(), symbol: z.string().optional() }))
	.handler(async ({ data, context }) => {
		const params = new URLSearchParams();
		if (data.symbol) params.set('symbol', data.symbol);
		const qs = params.toString();
		const res = await fetchDataService(
			`/api/performance/patterns/${data.personaId}${qs ? `?${qs}` : ''}`,
			{ headers: { 'X-Internal-User-Id': context.userId } },
		);
		if (!res.ok) {
			const body = await res.text();
			throw new AppError(`Failed to fetch patterns: ${body}`, res.status);
		}
		const json: PatternsResponse = await res.json();
		return json.data;
	});

export const getPerformanceOutcomes = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ status: z.string().optional() }))
	.handler(async ({ data, context }) => {
		const params = new URLSearchParams();
		if (data.status) params.set('status', data.status);
		const qs = params.toString();
		const res = await fetchDataService(`/api/performance/outcomes${qs ? `?${qs}` : ''}`, {
			headers: { 'X-Internal-User-Id': context.userId },
		});
		if (!res.ok) {
			const body = await res.text();
			throw new AppError(`Failed to fetch outcomes: ${body}`, res.status);
		}
		const json: OutcomesResponse = await res.json();
		return json.data;
	});

export const getOutcomeSnapshots = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ outcomeId: z.string() }))
	.handler(async ({ data, context }) => {
		const res = await fetchDataService(`/api/performance/snapshots/${data.outcomeId}`, {
			headers: { 'X-Internal-User-Id': context.userId },
		});
		if (!res.ok) {
			const body = await res.text();
			throw new AppError(`Failed to fetch snapshots: ${body}`, res.status);
		}
		const json: SnapshotsResponse = await res.json();
		return json.data;
	});
