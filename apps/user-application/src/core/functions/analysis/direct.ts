import type { AnalysisResult } from '@repo/data-ops/agents/ta/types';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { AppError } from '@/core/errors';
import { protectedFunctionMiddleware } from '@/core/middleware/auth';
import { fetchDataService } from '@/lib/data-service';

interface AnalysisResponse {
	data: AnalysisResult;
}

interface BatchAnalysisEntry {
	indicators?: AnalysisResult['indicators'];
	signals?: AnalysisResult['signals'];
	error?: string;
}

interface BatchAnalysisResponse {
	data: Record<string, BatchAnalysisEntry>;
}

const BatchInputSchema = z.object({
	symbols: z.array(z.string()),
	timeframe: z.string().optional(),
});

export const getAnalysis = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ symbol: z.string(), timeframe: z.string().optional() }))
	.handler(async ({ data, context }) => {
		const params = new URLSearchParams();
		if (data.timeframe) params.set('timeframe', data.timeframe);
		const qs = params.toString();
		const path = `/api/analysis/${data.symbol}${qs ? `?${qs}` : ''}`;

		const res = await fetchDataService(path, {
			headers: { 'X-Internal-User-Id': context.userId },
		});
		if (!res.ok) {
			const body = await res.text();
			throw new AppError(`Analysis failed: ${body}`, res.status);
		}
		const json: AnalysisResponse = await res.json();
		return json.data;
	});

export const getBatchAnalysis = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(BatchInputSchema)
	.handler(async ({ data, context }) => {
		const res = await fetchDataService('/api/analysis/batch', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Internal-User-Id': context.userId,
			},
			body: JSON.stringify({ symbols: data.symbols, timeframe: data.timeframe }),
		});
		if (!res.ok) {
			const body = await res.text();
			throw new AppError(`Batch analysis failed: ${body}`, res.status);
		}
		const json = (await res.json()) as BatchAnalysisResponse;
		return json.data;
	});
