import { ActivateRequestSchema, redeemInviteCode } from '@repo/data-ops/invite-code';
import { createServerFn } from '@tanstack/react-start';

export const activateAccount = createServerFn({ method: 'POST' })
	.inputValidator(ActivateRequestSchema)
	.handler(async ({ data }) => {
		const result = await redeemInviteCode(data.code, data.userId);

		if (!result.ok) {
			throw new Error(result.error);
		}

		return { activated: true };
	});
