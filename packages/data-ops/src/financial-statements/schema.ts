import { z } from 'zod';

export const StatementTypeSchema = z.enum(['income', 'balance_sheet', 'cash_flow']);

export const FinancialStatementSchema = z.object({
	id: z.string().uuid(),
	symbol: z.string(),
	statementType: StatementTypeSchema,
	period: z.string(),
	filingDate: z.date().nullable(),
	data: z.record(z.string(), z.unknown()),
	fetchedAt: z.date(),
});

export type StatementType = z.infer<typeof StatementTypeSchema>;
export type FinancialStatement = z.infer<typeof FinancialStatementSchema>;
