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

export { active_symbols } from '../active-symbol/table';
export { api_tokens, tokenTypeEnum } from '../api-token/table';
export { credentialProviderEnum, user_credentials } from '../credential/table';
export { debate_personas, personaBiasEnum } from '../debate-persona/table';
export { earnings } from '../earnings/table';
export { financial_statements } from '../financial-statements/table';
export { invite_codes } from '../invite-code/table';
export { llm_analyses, llm_usage } from '../llm-analysis/table';
export { market_data_bars } from '../market-data-bars/table';
export {
	insider_trades,
	institutional_holdings,
	price_targets,
} from '../market-intelligence/table';
export { notification_settings } from '../notification-settings/table';
export { signals } from '../signal/table';
export { technicalAnalysisConfig } from '../ta-config/table';
export { user_trading_config } from '../trading-config/table';
