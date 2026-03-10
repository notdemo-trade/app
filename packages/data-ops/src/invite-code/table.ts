import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auth_user } from '../drizzle/auth-schema';

export const invite_codes = pgTable('invite_codes', {
	id: uuid('id').defaultRandom().primaryKey(),
	code: text('code').notNull().unique(),
	used: boolean('used').default(false).notNull(),
	usedByUserId: text('used_by_user_id').references(() => auth_user.id, { onDelete: 'set null' }),
	usedAt: timestamp('used_at'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});
