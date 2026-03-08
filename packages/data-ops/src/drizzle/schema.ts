import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const agentConfigs = pgTable('agent_configs', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id').notNull().unique(),
	config: jsonb('config').notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const agentActivityLog = pgTable('agent_activity_log', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id').notNull(),
	action: text('action').notNull(),
	symbol: text('symbol'),
	details: jsonb('details').$type<Record<string, unknown>>(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

export { api_tokens, tokenTypeEnum } from '../api-token/table';
export { credentialProviderEnum, user_credentials } from '../credential/table';
export { llm_analyses, llm_usage } from '../llm-analysis/table';
export { signals } from '../signal/table';
export { user_trading_config } from '../trading-config/table';
