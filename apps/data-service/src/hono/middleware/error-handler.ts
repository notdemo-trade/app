import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { AppError } from '../types/result';

function toContentfulStatusCode(code: number): ContentfulStatusCode {
	if (code >= 400 && code <= 599) return code as ContentfulStatusCode;
	return 500;
}

function getHttpStatusMessage(status: number): string {
	const messages: Record<number, string> = {
		400: 'Bad Request',
		401: 'Unauthorized',
		403: 'Forbidden',
		404: 'Not Found',
		409: 'Conflict',
		429: 'Too Many Requests',
		500: 'Internal Server Error',
	};
	return messages[status] || 'Error';
}

async function getHttpExceptionMessage(e: HTTPException): Promise<string> {
	if (e.message) return e.message;
	try {
		const res = e.getResponse();
		return (await res.text()) || getHttpStatusMessage(e.status);
	} catch {
		return getHttpStatusMessage(e.status);
	}
}

export async function onErrorHandler(err: unknown, c: Context) {
	const requestId = c.get('requestId') || 'unknown';
	c.header('x-request-id', requestId);

	if (err instanceof HTTPException) {
		const msg = await getHttpExceptionMessage(err);
		return c.json({ error: msg, requestId }, toContentfulStatusCode(err.status));
	}

	console.error(`[${requestId}] Error:`, err);

	if (err instanceof AppError) {
		return c.json(
			{ error: err.message, ...(err.code && { code: err.code }) },
			toContentfulStatusCode(err.statusCode),
		);
	}

	if (err instanceof Error) {
		return c.json({ error: err.message }, 500);
	}

	return c.json({ error: 'Internal server error' }, 500);
}
