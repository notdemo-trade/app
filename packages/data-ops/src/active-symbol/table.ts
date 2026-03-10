import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const active_symbols = pgTable('active_symbols', {
	id: uuid('id').defaultRandom().primaryKey(),
	symbol: text('symbol').notNull().unique(),
	name: text('name'),
	assetClass: text('asset_class').notNull(),
	isActive: boolean('is_active').default(true).notNull(),
	addedAt: timestamp('added_at').defaultNow().notNull(),
	deactivatedAt: timestamp('deactivated_at'),
});
