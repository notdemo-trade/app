import type { DatabaseStatus } from '@repo/data-ops/health';
import { checkDatabase as checkDatabaseQuery } from '@repo/data-ops/health';
import type { Result } from '../types/result';
import { ok } from '../types/result';

interface StatusResponse {
	status: 'ok' | 'degraded';
	time: string;
	database: DatabaseStatus;
	userId: string;
}

export async function getStatus(userId: string): Promise<Result<StatusResponse>> {
	const dbStatus = await checkDatabaseQuery();
	return ok({
		status: dbStatus === 'connected' ? 'ok' : 'degraded',
		time: new Date().toISOString(),
		database: dbStatus,
		userId,
	});
}
