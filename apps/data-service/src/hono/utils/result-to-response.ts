import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Result } from '../types/result';

export function resultToResponse<T>(
	c: Context,
	result: Result<T>,
	successStatus: ContentfulStatusCode = 200,
) {
	if (result.ok) {
		return c.json(result.data, successStatus);
	}
	const status = (
		result.error.statusCode >= 400 && result.error.statusCode <= 599 ? result.error.statusCode : 500
	) as ContentfulStatusCode;
	return c.json(
		{
			error: result.error.message,
			...(result.error.code && { code: result.error.code }),
		},
		status,
	);
}
