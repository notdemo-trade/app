import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../database/setup';
import { invite_codes } from './table';

type RedeemResult = { ok: true } | { ok: false; error: 'INVALID_CODE' | 'ALREADY_USED' };

function generateCode(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	const segment = () =>
		Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
	return `NT-${segment()}-${segment()}`;
}

export async function generateInviteCodes(count: number): Promise<string[]> {
	const db = getDb();
	const codes = Array.from({ length: count }, () => generateCode());

	const result = await db
		.insert(invite_codes)
		.values(codes.map((code) => ({ code })))
		.onConflictDoNothing()
		.returning({ code: invite_codes.code });

	return result.map((r) => r.code);
}

export async function redeemInviteCode(code: string, userId: string): Promise<RedeemResult> {
	const db = getDb();

	const [updated] = await db
		.update(invite_codes)
		.set({
			used: true,
			usedByUserId: userId,
			usedAt: new Date(),
		})
		.where(and(eq(invite_codes.code, code), eq(invite_codes.used, false)))
		.returning({ id: invite_codes.id });

	if (!updated) {
		const [existing] = await db
			.select({ used: invite_codes.used })
			.from(invite_codes)
			.where(eq(invite_codes.code, code));

		if (!existing) {
			return { ok: false, error: 'INVALID_CODE' };
		}
		return { ok: false, error: 'ALREADY_USED' };
	}

	await db.execute(sql`UPDATE auth_user SET activated = true WHERE id = ${userId}`);

	return { ok: true };
}
