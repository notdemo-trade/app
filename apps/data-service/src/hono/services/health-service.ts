import type { DatabaseStatus } from '@repo/data-ops/health';
import { checkDatabase as checkDatabaseQuery } from '@repo/data-ops/health';
import type { Result } from '../types/result';
import { ok } from '../types/result';

export async function checkDatabase(): Promise<Result<DatabaseStatus>> {
	const status = await checkDatabaseQuery();
	return ok(status);
}
