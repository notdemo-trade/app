import type { TelegramInlineKeyboard, TelegramMessage } from './types';

const TELEGRAM_API = 'https://api.telegram.org/bot';

interface TelegramServiceConfig {
	botToken: string;
	chatId: string;
}

export class TelegramService {
	private baseUrl: string;
	private chatId: string;

	constructor(config: TelegramServiceConfig) {
		this.baseUrl = `${TELEGRAM_API}${config.botToken}`;
		this.chatId = config.chatId;
	}

	async sendMessage(text: string, replyMarkup?: TelegramInlineKeyboard): Promise<number> {
		const body: TelegramMessage = {
			chat_id: this.chatId,
			text,
			parse_mode: 'HTML',
			...(replyMarkup && { reply_markup: replyMarkup }),
		};

		const res = await fetch(`${this.baseUrl}/sendMessage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const error = await res.text();
			throw new TelegramApiError(res.status, error);
		}

		const data = (await res.json()) as { result: { message_id: number } };
		return data.result.message_id;
	}

	async editMessage(messageId: number, text: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/editMessageText`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: this.chatId,
				message_id: messageId,
				text,
				parse_mode: 'HTML',
			}),
		});

		if (!res.ok) {
			const error = await res.text();
			throw new TelegramApiError(res.status, error);
		}
	}

	async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
		await fetch(`${this.baseUrl}/answerCallbackQuery`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				callback_query_id: callbackQueryId,
				text,
			}),
		});
	}

	async testConnection(): Promise<{ ok: boolean; username?: string }> {
		const res = await fetch(`${this.baseUrl}/getMe`);
		if (!res.ok) return { ok: false };
		const data = (await res.json()) as { result: { username: string } };
		return { ok: true, username: data.result.username };
	}
}

export class TelegramApiError extends Error {
	constructor(
		public statusCode: number,
		public body: string,
	) {
		super(`Telegram API error (${statusCode}): ${body}`);
		this.name = 'TelegramApiError';
	}
}

export async function registerWebhook(botToken: string, webhookUrl: string): Promise<void> {
	const res = await fetch(`${TELEGRAM_API}${botToken}/setWebhook`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url: webhookUrl }),
	});

	if (!res.ok) {
		throw new Error(`Failed to register webhook: ${await res.text()}`);
	}
}
