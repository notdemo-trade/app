import { env } from 'cloudflare:workers';
import { verifyTurnstileToken } from '@repo/data-ops/auth/turnstile';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

const VerifyTurnstileInput = z.object({
	token: z.string().min(1),
});

export const verifyTurnstile = createServerFn({ method: 'POST' })
	.inputValidator(VerifyTurnstileInput)
	.handler(async ({ data }) => {
		const secretKey =
			(env as unknown as Record<string, string>).TURNSTILE_SECRET_KEY ??
			'1x0000000000000000000000000000000AA';

		const result = await verifyTurnstileToken(data.token, secretKey);

		if (!result.success) {
			throw new Error('Turnstile verification failed');
		}

		return { success: true };
	});
