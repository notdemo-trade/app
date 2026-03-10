import { env } from 'cloudflare:workers';
import type { TelegramCredential } from '@repo/data-ops/credential';
import { getCredential, saveCredential } from '@repo/data-ops/credential';
import {
	getNotificationSettings,
	NotificationSettingsSchema,
	upsertNotificationSettings,
} from '@repo/data-ops/notification-settings';
import { registerWebhook, TelegramService } from '@repo/data-ops/telegram';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { protectedFunctionMiddleware } from '@/core/middleware/auth';

export const getSettings = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }) => {
		const settings = await getNotificationSettings(context.userId);
		return (
			settings ?? {
				userId: context.userId,
				enableTradeProposals: true,
				enableTradeResults: true,
				enableDailySummary: true,
				enableRiskAlerts: true,
				dailySummaryTime: '17:00',
				quietHoursStart: null,
				quietHoursEnd: null,
			}
		);
	});

export const updateSettings = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(NotificationSettingsSchema)
	.handler(async ({ data, context }) => {
		await upsertNotificationSettings(context.userId, data);
		return { success: true as const };
	});

export const getTelegramStatus = createServerFn({ method: 'GET' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }) => {
		const cred = await getCredential<TelegramCredential>({
			userId: context.userId,
			provider: 'telegram',
			masterKey: env.CREDENTIALS_ENCRYPTION_KEY,
		});

		if (!cred) {
			return { connected: false as const, reason: 'no_credentials' as const };
		}

		const telegram = new TelegramService({
			botToken: cred.botToken,
			chatId: cred.chatId || '',
		});
		const result = await telegram.testConnection();

		return {
			connected: result.ok && !!cred.chatId,
			botUsername: result.username,
			hasChatId: !!cred.chatId,
		};
	});

export const saveTelegramBot = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.inputValidator(z.object({ botToken: z.string().min(1) }))
	.handler(async ({ data, context }) => {
		const webhookSecret = crypto.randomUUID();

		await saveCredential({
			userId: context.userId,
			provider: 'telegram',
			data: { botToken: data.botToken, chatId: '', webhookSecret },
			masterKey: env.CREDENTIALS_ENCRYPTION_KEY,
		});

		const apiDomain =
			env.CLOUDFLARE_ENV === 'production' ? 'api.notdemo.trade' : 'api-staging.notdemo.trade';
		await registerWebhook(
			data.botToken,
			`https://${apiDomain}/api/telegram/webhook/${webhookSecret}`,
		);

		const telegram = new TelegramService({ botToken: data.botToken, chatId: '' });
		const testResult = await telegram.testConnection();

		return { success: true as const, botUsername: testResult.username };
	});

export const sendTestMessage = createServerFn({ method: 'POST' })
	.middleware([protectedFunctionMiddleware])
	.handler(async ({ context }) => {
		const cred = await getCredential<TelegramCredential>({
			userId: context.userId,
			provider: 'telegram',
			masterKey: env.CREDENTIALS_ENCRYPTION_KEY,
		});

		if (!cred?.chatId) {
			throw new Error('Telegram not configured');
		}

		const telegram = new TelegramService(cred);
		await telegram.sendMessage(
			'<b>Test Notification</b>\n\nYour Telegram is configured correctly!',
		);
		return { success: true as const };
	});
