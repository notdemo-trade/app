import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auth_user } from '../../drizzle/auth-schema';
import type { OrchestratorConfig } from './types';

export const agentConfigs = pgTable('agent_configs', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id')
		.notNull()
		.references(() => auth_user.id, { onDelete: 'cascade' })
		.unique(),
	config: jsonb('config').$type<OrchestratorConfig>().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const agentActivityLog = pgTable('agent_activity_log', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id')
		.notNull()
		.references(() => auth_user.id, { onDelete: 'cascade' }),
	action: text('action').notNull(),
	symbol: text('symbol'),
	details: jsonb('details').$type<Record<string, unknown>>(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});
