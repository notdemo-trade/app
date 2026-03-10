import { eq } from 'drizzle-orm';
import { getDb } from '../database/setup';
import type { NotificationSettingsRecord } from './table';
import { notification_settings } from './table';

export async function getNotificationSettings(
	userId: string,
): Promise<NotificationSettingsRecord | null> {
	const db = getDb();
	const [result] = await db
		.select()
		.from(notification_settings)
		.where(eq(notification_settings.userId, userId))
		.limit(1);
	return result ?? null;
}

export async function upsertNotificationSettings(
	userId: string,
	settings: Partial<Omit<NotificationSettingsRecord, 'userId' | 'updatedAt'>>,
): Promise<void> {
	const db = getDb();
	await db
		.insert(notification_settings)
		.values({ userId, ...settings })
		.onConflictDoUpdate({
			target: notification_settings.userId,
			set: { ...settings, updatedAt: new Date() },
		});
}
