import type { TelegramCredential } from '@repo/data-ops/credential';
import { getCredential, listUserIdsByProvider, saveCredential } from '@repo/data-ops/credential';
import { TelegramService, TelegramWebhookUpdateSchema } from '@repo/data-ops/telegram';
import { getAgentByName } from 'agents';
import { Hono } from 'hono';
import type { SessionAgent } from '../../agents/session-agent';

const telegramWebhook = new Hono<{ Bindings: Env }>();

telegramWebhook.post('/webhook/:webhookSecret', async (c) => {
	const { webhookSecret } = c.req.param();

	const userId = await resolveUserFromWebhookSecret(c.env, webhookSecret);
	if (!userId) {
		return c.json({ ok: true });
	}

	const parseResult = TelegramWebhookUpdateSchema.safeParse(await c.req.json());
	if (!parseResult.success) {
		return c.json({ ok: true });
	}
	const update = parseResult.data;

	if (update.message?.text === '/start') {
		const chatId = String(update.message.chat.id);

		const existingCred = await getCredential<TelegramCredential>({
			userId,
			provider: 'telegram',
			masterKey: c.env.CREDENTIALS_ENCRYPTION_KEY,
		});
		if (existingCred) {
			await saveCredential({
				userId,
				provider: 'telegram',
				data: {
					botToken: existingCred.botToken,
					chatId,
					webhookSecret: existingCred.webhookSecret,
				},
				masterKey: c.env.CREDENTIALS_ENCRYPTION_KEY,
			});

			const telegram = new TelegramService({ botToken: existingCred.botToken, chatId });
			await telegram.sendMessage(
				"<b>Setup Complete!</b>\n\nYou'll now receive trade proposals and notifications here.",
			);
		}

		return c.json({ ok: true });
	}

	if (update.callback_query) {
		const { id: callbackId, data } = update.callback_query;

		const [action, proposalId] = data.split(':');
		if (!proposalId || (action !== 'approve' && action !== 'reject')) {
			return c.json({ ok: true });
		}

		const session = await getAgentByName<Env, SessionAgent>(c.env.SessionAgent, userId);

		try {
			if (action === 'approve') {
				await session.approveProposal(proposalId);
			} else {
				await session.rejectProposal(proposalId);
			}
		} catch (err) {
			console.warn('Telegram callback failed:', err);
		}

		const cred = await getCredential<TelegramCredential>({
			userId,
			provider: 'telegram',
			masterKey: c.env.CREDENTIALS_ENCRYPTION_KEY,
		});
		if (cred?.chatId) {
			const telegram = new TelegramService(cred);
			await telegram.answerCallbackQuery(
				callbackId,
				action === 'approve' ? 'Trade approved!' : 'Trade rejected',
			);
		}

		return c.json({ ok: true });
	}

	return c.json({ ok: true });
});

/**
 * Resolve userId from webhook secret by scanning all telegram credentials.
 * For production scale, consider a KV lookup table mapping secret -> userId.
 */
async function resolveUserFromWebhookSecret(
	env: Env,
	webhookSecret: string,
): Promise<string | null> {
	const userIds = await listUserIdsByProvider('telegram');

	for (const uid of userIds) {
		const cred = await getCredential<TelegramCredential>({
			userId: uid,
			provider: 'telegram',
			masterKey: env.CREDENTIALS_ENCRYPTION_KEY,
		});
		if (cred?.webhookSecret === webhookSecret) {
			return uid;
		}
	}
	return null;
}

export { telegramWebhook };
