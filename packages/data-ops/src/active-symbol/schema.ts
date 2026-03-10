import { z } from 'zod';

export const AssetClassSchema = z.enum(['stock', 'etf']);

export const ActiveSymbolSchema = z.object({
	id: z.string().uuid(),
	symbol: z.string().min(1).max(10),
	name: z.string().nullable(),
	assetClass: AssetClassSchema,
	isActive: z.boolean(),
	addedAt: z.date(),
	deactivatedAt: z.date().nullable(),
});

export const UpsertActiveSymbolSchema = z.object({
	symbol: z.string().min(1).max(10),
	name: z.string().optional(),
	assetClass: AssetClassSchema.default('stock'),
});

export type AssetClass = z.infer<typeof AssetClassSchema>;
export type ActiveSymbol = z.infer<typeof ActiveSymbolSchema>;
export type UpsertActiveSymbol = z.infer<typeof UpsertActiveSymbolSchema>;
