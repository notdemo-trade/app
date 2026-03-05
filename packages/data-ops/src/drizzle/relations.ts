import { relations } from 'drizzle-orm/relations';
import { api_tokens } from '../api-token/table';
import { user_credentials } from '../credential/table';
import { user_trading_config } from '../trading-config/table';
import { auth_user } from './auth-schema';

export const authUserRelations = relations(auth_user, ({ many, one }) => ({
	apiTokens: many(api_tokens),
	credentials: many(user_credentials),
	tradingConfig: one(user_trading_config),
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
