import { and, asc, count, eq } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { debate_personas } from './table';

export async function getDebatePersonas(userId: string) {
	const db = getDb();
	return db
		.select()
		.from(debate_personas)
		.where(eq(debate_personas.userId, userId))
		.orderBy(asc(debate_personas.sortOrder), asc(debate_personas.createdAt));
}

export async function getDebatePersonaById(userId: string, id: string) {
	const db = getDb();
	const rows = await db
		.select()
		.from(debate_personas)
		.where(and(eq(debate_personas.id, id), eq(debate_personas.userId, userId)));
	return rows[0] ?? null;
}

export async function getDebatePersonaByName(userId: string, name: string) {
	const db = getDb();
	const rows = await db
		.select()
		.from(debate_personas)
		.where(and(eq(debate_personas.name, name), eq(debate_personas.userId, userId)));
	return rows[0] ?? null;
}

export async function countUserPersonas(userId: string): Promise<number> {
	const db = getDb();
	const result = await db
		.select({ value: count() })
		.from(debate_personas)
		.where(eq(debate_personas.userId, userId));
	return result[0]?.value ?? 0;
}

export async function createDebatePersona(
	userId: string,
	data: {
		name: string;
		displayName: string;
		systemPrompt: string;
		role: string;
		bias: 'bullish' | 'bearish' | 'neutral';
		isDefault?: boolean;
		sortOrder?: number;
	},
) {
	const db = getDb();
	const rows = await db
		.insert(debate_personas)
		.values({
			userId,
			name: data.name,
			displayName: data.displayName,
			systemPrompt: data.systemPrompt,
			role: data.role,
			bias: data.bias,
			isDefault: data.isDefault ?? false,
			sortOrder: data.sortOrder ?? 0,
		})
		.returning();
	return rows[0]!;
}

export async function updateDebatePersona(
	userId: string,
	id: string,
	data: {
		displayName?: string;
		systemPrompt?: string;
		role?: string;
		bias?: 'bullish' | 'bearish' | 'neutral';
		isActive?: boolean;
		sortOrder?: number;
	},
) {
	const db = getDb();
	const rows = await db
		.update(debate_personas)
		.set(data)
		.where(and(eq(debate_personas.id, id), eq(debate_personas.userId, userId)))
		.returning();
	return rows[0] ?? null;
}

export async function deleteDebatePersona(userId: string, id: string) {
	const db = getDb();
	const rows = await db
		.delete(debate_personas)
		.where(and(eq(debate_personas.id, id), eq(debate_personas.userId, userId)))
		.returning();
	return rows[0] ?? null;
}

export async function deleteUserCustomPersonas(userId: string) {
	const db = getDb();
	await db
		.delete(debate_personas)
		.where(and(eq(debate_personas.userId, userId), eq(debate_personas.isDefault, false)));
}

export async function seedDefaultPersonas(userId: string) {
	const db = getDb();
	const defaults = [
		{
			userId,
			name: 'bull_analyst',
			displayName: 'Bull Analyst',
			role: 'Identifies buying opportunities and upside catalysts',
			systemPrompt: `You are a bullish market analyst. Your job is to find compelling reasons to BUY the given asset. Focus on:
- Positive technical momentum signals
- Upside catalysts and growth drivers
- Favorable risk/reward setups
- Historical patterns suggesting appreciation
Be specific with price targets and entry points. Acknowledge risks but emphasize opportunity.`,
			bias: 'bullish' as const,
			isDefault: true,
			sortOrder: 1,
		},
		{
			userId,
			name: 'bear_analyst',
			displayName: 'Bear Analyst',
			role: 'Identifies selling opportunities and downside risks',
			systemPrompt: `You are a bearish market analyst. Your job is to find compelling reasons to SELL or AVOID the given asset. Focus on:
- Negative technical signals and breakdown patterns
- Downside risks and headwinds
- Overvaluation indicators
- Historical patterns suggesting depreciation
Be specific with risk levels and stop-loss recommendations. Acknowledge upside but emphasize caution.`,
			bias: 'bearish' as const,
			isDefault: true,
			sortOrder: 2,
		},
		{
			userId,
			name: 'risk_manager',
			displayName: 'Risk Manager',
			role: 'Evaluates risk/reward and recommends position sizing',
			systemPrompt: `You are a portfolio risk manager. Your job is to evaluate the risk/reward profile of a potential trade. Focus on:
- Position sizing relative to portfolio
- Maximum acceptable loss
- Correlation with existing positions
- Market regime and volatility environment
- Liquidity and execution risk
Be precise with position size recommendations and stop-loss levels. Your priority is capital preservation.`,
			bias: 'neutral' as const,
			isDefault: true,
			sortOrder: 3,
		},
	];

	await db.insert(debate_personas).values(defaults).onConflictDoNothing();

	return getDebatePersonas(userId);
}
