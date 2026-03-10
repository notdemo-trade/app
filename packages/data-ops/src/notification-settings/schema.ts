import { z } from 'zod';

export const NotificationSettingsSchema = z.object({
	enableTradeProposals: z.boolean().optional(),
	enableTradeResults: z.boolean().optional(),
	enableDailySummary: z.boolean().optional(),
	enableRiskAlerts: z.boolean().optional(),
	dailySummaryTime: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.optional(),
	quietHoursStart: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.nullable()
		.optional(),
	quietHoursEnd: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.nullable()
		.optional(),
});

export type NotificationSettingsInput = z.infer<typeof NotificationSettingsSchema>;
