import { z } from 'zod';

export const TelegramCredentialSchema = z.object({
	botToken: z.string().min(1),
	chatId: z.string(),
	webhookSecret: z.string().optional(),
});

export type TelegramCredential = z.infer<typeof TelegramCredentialSchema>;

export const TelegramWebhookUpdateSchema = z.object({
	update_id: z.number(),
	message: z
		.object({
			message_id: z.number(),
			from: z.object({ id: z.number(), username: z.string().optional() }),
			chat: z.object({ id: z.number(), type: z.string() }),
			text: z.string().optional(),
		})
		.optional(),
	callback_query: z
		.object({
			id: z.string(),
			from: z.object({ id: z.number(), username: z.string().optional() }),
			message: z.object({
				message_id: z.number(),
				chat: z.object({ id: z.number() }),
			}),
			data: z.string(),
		})
		.optional(),
});
