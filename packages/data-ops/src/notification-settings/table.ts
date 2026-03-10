import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { auth_user } from '../drizzle/auth-schema';

export const notification_settings = pgTable('notification_settings', {
	userId: text('user_id')
		.primaryKey()
		.references(() => auth_user.id, { onDelete: 'cascade' }),
	enableTradeProposals: boolean('enable_trade_proposals').notNull().default(true),
	enableTradeResults: boolean('enable_trade_results').notNull().default(true),
	enableDailySummary: boolean('enable_daily_summary').notNull().default(true),
	enableRiskAlerts: boolean('enable_risk_alerts').notNull().default(true),
	dailySummaryTime: text('daily_summary_time').notNull().default('17:00'),
	quietHoursStart: text('quiet_hours_start'),
	quietHoursEnd: text('quiet_hours_end'),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export type NotificationSettingsRecord = typeof notification_settings.$inferSelect;
