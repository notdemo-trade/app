import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { LLMAnalysisResult } from '../agents/llm/types';
import { getDb } from '../database/setup';
import { llm_analyses, llm_usage } from './table';

export async function insertAnalysis(result: LLMAnalysisResult) {
	const db = getDb();
	const [row] = await db
		.insert(llm_analyses)
		.values({
			id: result.id,
			userId: result.userId,
			symbol: result.symbol,
			action: result.recommendation.action,
			confidence: result.recommendation.confidence,
			rationale: result.recommendation.rationale,
			entryPrice: result.recommendation.entry_price ?? null,
			targetPrice: result.recommendation.target_price ?? null,
			stopLoss: result.recommendation.stop_loss ?? null,
			positionSizePct: result.recommendation.position_size_pct ?? null,
			timeframe: result.recommendation.timeframe ?? null,
			risks: result.recommendation.risks,
			research: result.research ?? null,
			technicals: null,
			signals: result.recommendation.risks ? null : null,
			strategyId: result.strategyId,
			model: result.model,
			provider: result.provider,
			promptTokens: result.usage.prompt_tokens,
			completionTokens: result.usage.completion_tokens,
			totalTokens: result.usage.total_tokens,
			estimatedCostUsd: result.usage.estimated_cost_usd,
		})
		.returning();
	return row;
}

interface GetAnalysesParams {
	symbol?: string;
	limit?: number;
}

export async function getAnalyses(userId: string, params: GetAnalysesParams = {}) {
	const db = getDb();
	const conditions = [eq(llm_analyses.userId, userId)];
	if (params.symbol) {
		conditions.push(eq(llm_analyses.symbol, params.symbol));
	}
	return db
		.select()
		.from(llm_analyses)
		.where(and(...conditions))
		.orderBy(desc(llm_analyses.createdAt))
		.limit(params.limit ?? 20);
}

export async function getAnalysisById(userId: string, id: string) {
	const db = getDb();
	const [row] = await db
		.select()
		.from(llm_analyses)
		.where(and(eq(llm_analyses.userId, userId), eq(llm_analyses.id, id)))
		.limit(1);
	return row ?? null;
}

interface UpdateUsageParams {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	estimatedCostUsd: number;
}

export async function updateUsage(
	userId: string,
	provider: string,
	model: string,
	params: UpdateUsageParams,
) {
	const db = getDb();
	const today = new Date().toISOString().slice(0, 10);

	await db
		.insert(llm_usage)
		.values({
			userId,
			date: today,
			provider,
			model,
			promptTokens: params.promptTokens,
			completionTokens: params.completionTokens,
			totalTokens: params.totalTokens,
			estimatedCostUsd: params.estimatedCostUsd,
			requestCount: 1,
		})
		.onConflictDoUpdate({
			target: [llm_usage.userId, llm_usage.date, llm_usage.provider],
			set: {
				promptTokens: sql`${llm_usage.promptTokens} + ${params.promptTokens}`,
				completionTokens: sql`${llm_usage.completionTokens} + ${params.completionTokens}`,
				totalTokens: sql`${llm_usage.totalTokens} + ${params.totalTokens}`,
				estimatedCostUsd: sql`${llm_usage.estimatedCostUsd} + ${params.estimatedCostUsd}`,
				requestCount: sql`${llm_usage.requestCount} + 1`,
			},
		});
}

export async function getUsageSummary(userId: string, days = 30) {
	const db = getDb();
	const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

	const rows = await db
		.select()
		.from(llm_usage)
		.where(and(eq(llm_usage.userId, userId), gte(llm_usage.date, since)))
		.orderBy(desc(llm_usage.date));

	let totalTokens = 0;
	let totalCostUsd = 0;
	const byProvider: Record<string, { tokens: number; cost: number }> = {};
	const byDayMap: Record<string, { tokens: number; cost: number }> = {};

	for (const row of rows) {
		totalTokens += row.totalTokens;
		totalCostUsd += row.estimatedCostUsd;

		const prov = byProvider[row.provider] ?? { tokens: 0, cost: 0 };
		prov.tokens += row.totalTokens;
		prov.cost += row.estimatedCostUsd;
		byProvider[row.provider] = prov;

		const day = byDayMap[row.date] ?? { tokens: 0, cost: 0 };
		day.tokens += row.totalTokens;
		day.cost += row.estimatedCostUsd;
		byDayMap[row.date] = day;
	}

	const byDay = Object.entries(byDayMap).map(([date, data]) => ({ date, ...data }));

	return { totalTokens, totalCostUsd, byProvider, byDay };
}
