import { relations } from 'drizzle-orm/relations';
import { api_tokens } from '../api-token/table';
import { auth_user } from './auth-schema';

export const authUserRelations = relations(auth_user, ({ many }) => ({
	apiTokens: many(api_tokens),
}));

export const apiTokenRelations = relations(api_tokens, ({ one }) => ({
	user: one(auth_user, {
		fields: [api_tokens.userId],
		references: [auth_user.id],
	}),
}));
