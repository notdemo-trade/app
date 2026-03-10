import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../database/setup';
import type { StatementType } from './schema';
import { financial_statements } from './table';

export async function getLatestStatement(
	symbol: string,
	statementType: StatementType,
): Promise<Record<string, unknown> | null> {
	const db = getDb();
	const rows = await db
		.select({ data: financial_statements.data })
		.from(financial_statements)
		.where(
			and(
				eq(financial_statements.symbol, symbol),
				eq(financial_statements.statementType, statementType),
			),
		)
		.orderBy(desc(financial_statements.fetchedAt))
		.limit(1);

	return (rows[0]?.data as Record<string, unknown>) ?? null;
}

export async function upsertFinancialStatement(params: {
	symbol: string;
	statementType: StatementType;
	period: string;
	filingDate?: Date;
	data: Record<string, unknown>;
}): Promise<void> {
	const db = getDb();
	await db
		.insert(financial_statements)
		.values({
			symbol: params.symbol,
			statementType: params.statementType,
			period: params.period,
			filingDate: params.filingDate ?? null,
			data: params.data,
		})
		.onConflictDoUpdate({
			target: [
				financial_statements.symbol,
				financial_statements.statementType,
				financial_statements.period,
			],
			set: {
				data: sql`excluded.data`,
				filingDate: sql`excluded.filing_date`,
				fetchedAt: sql`now()`,
			},
		});
}
