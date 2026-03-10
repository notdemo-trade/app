import { getCredential } from '../credential/queries';
import { getNotificationSettings } from '../notification-settings/queries';
import type { TelegramCredential } from './schema';
import { TelegramService } from './service';
import type { NotificationType, TelegramInlineKeyboard } from './types';

interface DispatchParams {
	userId: string;
	masterKey: string;
}

export async function dispatchNotification(
	params: DispatchParams,
	type: NotificationType,
	message: string,
	keyboard?: TelegramInlineKeyboard,
): Promise<{ sent: boolean; messageId?: number; reason?: string }> {
	const settings = await getNotificationSettings(params.userId);

	if (settings) {
		const enabledMap: Record<NotificationType, boolean> = {
			trade_proposal: settings.enableTradeProposals,
			trade_executed: settings.enableTradeResults,
			trade_rejected: settings.enableTradeResults,
			trade_failed: settings.enableTradeResults,
			daily_summary: settings.enableDailySummary,
			risk_alert: settings.enableRiskAlerts,
		};

		if (!enabledMap[type]) {
			return { sent: false, reason: 'disabled' };
		}

		if (type !== 'risk_alert' && type !== 'trade_proposal') {
			if (isQuietHours(settings.quietHoursStart, settings.quietHoursEnd)) {
				return { sent: false, reason: 'quiet_hours' };
			}
		}
	}

	const cred = await getCredential<TelegramCredential>({
		userId: params.userId,
		provider: 'telegram',
		masterKey: params.masterKey,
	});
	if (!cred || !cred.chatId) {
		return { sent: false, reason: 'no_credentials' };
	}

	const telegram = new TelegramService(cred);

	try {
		const messageId = await telegram.sendMessage(message, keyboard);
		return { sent: true, messageId };
	} catch (err) {
		console.error('Telegram send failed:', err);
		return { sent: false, reason: 'send_failed' };
	}
}

function isQuietHours(start: string | null, end: string | null): boolean {
	if (!start || !end) return false;

	const now = new Date();
	const currentMins = now.getHours() * 60 + now.getMinutes();

	const [startH, startM] = start.split(':').map(Number);
	const [endH, endM] = end.split(':').map(Number);
	const startMins = (startH ?? 0) * 60 + (startM ?? 0);
	const endMins = (endH ?? 0) * 60 + (endM ?? 0);

	if (startMins <= endMins) {
		return currentMins >= startMins && currentMins < endMins;
	}
	return currentMins >= startMins || currentMins < endMins;
}
