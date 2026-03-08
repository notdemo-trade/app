import { relations } from 'drizzle-orm/relations';
import { api_tokens } from '../api-token/table';
import { user_credentials } from '../credential/table';
import { llm_analyses, llm_usage } from '../llm-analysis/table';
import { technicalAnalysisConfig } from '../ta-config/table';
import { user_trading_config } from '../trading-config/table';
import { auth_user } from './auth-schema';

export const authUserRelations = relations(auth_user, ({ many, one }) => ({
	apiTokens: many(api_tokens),
	credentials: many(user_credentials),
	tradingConfig: one(user_trading_config),
	technicalAnalysisConfig: one(technicalAnalysisConfig),
	llmAnalyses: many(llm_analyses),
	llmUsage: many(llm_usage),
}));

export const apiTokenRelations = relations(api_tokens, ({ one }) => ({
	user: one(auth_user, {
		fields: [api_tokens.userId],
		references: [auth_user.id],
	}),
}));

export const credentialRelations = relations(user_credentials, ({ one }) => ({
	user: one(auth_user, {
		fields: [user_credentials.userId],
		references: [auth_user.id],
	}),
}));

export const tradingConfigRelations = relations(user_trading_config, ({ one }) => ({
	user: one(auth_user, {
		fields: [user_trading_config.userId],
		references: [auth_user.id],
	}),
}));

export const llmAnalysesRelations = relations(llm_analyses, ({ one }) => ({
	user: one(auth_user, {
		fields: [llm_analyses.userId],
		references: [auth_user.id],
	}),
}));

export const llmUsageRelations = relations(llm_usage, ({ one }) => ({
	user: one(auth_user, {
		fields: [llm_usage.userId],
		references: [auth_user.id],
	}),
}));

export const technicalAnalysisConfigRelations = relations(technicalAnalysisConfig, ({ one }) => ({
	user: one(auth_user, {
		fields: [technicalAnalysisConfig.userId],
		references: [auth_user.id],
	}),
}));
