import { zValidator } from '@hono/zod-validator';
import type { TelegramCredential } from '@repo/data-ops/credential';
import { getCredential } from '@repo/data-ops/credential';
import {
	getNotificationSettings,
	NotificationSettingsSchema,
	upsertNotificationSettings,
} from '@repo/data-ops/notification-settings';
import { TelegramService } from '@repo/data-ops/telegram';
import { Hono } from 'hono';
import { sessionAuthMiddleware } from '../middleware/session-auth';

const notificationSettingsRouter = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

notificationSettingsRouter.use('*', sessionAuthMiddleware);

notificationSettingsRouter.get('/', async (c) => {
	const userId = c.get('userId');
	const settings = await getNotificationSettings(userId);

	return c.json({
		data: settings ?? {
			userId,
			enableTradeProposals: true,
			enableTradeResults: true,
			enableDailySummary: true,
			enableRiskAlerts: true,
			dailySummaryTime: '17:00',
			quietHoursStart: null,
			quietHoursEnd: null,
		},
	});
});

notificationSettingsRouter.patch('/', zValidator('json', NotificationSettingsSchema), async (c) => {
	const userId = c.get('userId');
	const data = c.req.valid('json');
	await upsertNotificationSettings(userId, data);
	return c.json({ success: true });
});

notificationSettingsRouter.get('/telegram/status', async (c) => {
	const userId = c.get('userId');
	const cred = await getCredential<TelegramCredential>({
		userId,
		provider: 'telegram',
		masterKey: c.env.CREDENTIALS_ENCRYPTION_KEY,
	});

	if (!cred) {
		return c.json({ connected: false, reason: 'no_credentials' });
	}

	const telegram = new TelegramService({ botToken: cred.botToken, chatId: cred.chatId || '' });
	const result = await telegram.testConnection();

	return c.json({
		connected: result.ok && !!cred.chatId,
		botUsername: result.username,
		hasChatId: !!cred.chatId,
	});
});

notificationSettingsRouter.post('/telegram/test', async (c) => {
	const userId = c.get('userId');
	const cred = await getCredential<TelegramCredential>({
		userId,
		provider: 'telegram',
		masterKey: c.env.CREDENTIALS_ENCRYPTION_KEY,
	});

	if (!cred?.chatId) {
		return c.json({ success: false, error: 'Telegram not configured' }, 400);
	}

	const telegram = new TelegramService(cred);
	try {
		await telegram.sendMessage(
			'<b>Test Notification</b>\n\nYour Telegram is configured correctly!',
		);
		return c.json({ success: true });
	} catch (err) {
		return c.json({ success: false, error: String(err) }, 400);
	}
});

export { notificationSettingsRouter };
