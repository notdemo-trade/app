export interface TelegramMessage {
	chat_id: string;
	text: string;
	parse_mode?: 'HTML' | 'Markdown';
	reply_markup?: TelegramInlineKeyboard;
}

export interface TelegramInlineKeyboard {
	inline_keyboard: TelegramButton[][];
}

export interface TelegramButton {
	text: string;
	callback_data: string;
}

export interface TelegramUpdate {
	update_id: number;
	message?: {
		message_id: number;
		from: { id: number; username?: string };
		chat: { id: number; type: string };
		text?: string;
	};
	callback_query?: {
		id: string;
		from: { id: number; username?: string };
		message: { message_id: number; chat: { id: number } };
		data: string;
	};
}

export type NotificationType =
	| 'trade_proposal'
	| 'trade_executed'
	| 'trade_rejected'
	| 'trade_failed'
	| 'daily_summary'
	| 'risk_alert';
