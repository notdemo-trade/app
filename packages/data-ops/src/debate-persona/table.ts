import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';
import { auth_user } from '../drizzle/auth-schema';

export const personaBiasEnum = pgEnum('persona_bias', ['bullish', 'bearish', 'neutral']);

export const debate_personas = pgTable(
	'debate_personas',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => auth_user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		displayName: text('display_name').notNull(),
		systemPrompt: text('system_prompt').notNull(),
		role: text('role').notNull(),
		bias: personaBiasEnum('bias').notNull().default('neutral'),
		isActive: boolean('is_active').notNull().default(true),
		isDefault: boolean('is_default').notNull().default(false),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index('idx_debate_personas_user_id').on(table.userId),
		uniqueIndex('idx_debate_personas_user_name').on(table.userId, table.name),
	],
);
