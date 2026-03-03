export class AppError extends Error {
	constructor(
		message: string,
		public readonly statusCode: number = 500,
		public readonly code?: string,
	) {
		super(message);
		this.name = 'AppError';
	}
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function ok<T>(data: T): Result<T> {
	return { ok: true, data };
}

export function err<T>(error: AppError): Result<T> {
	return { ok: false, error };
}
