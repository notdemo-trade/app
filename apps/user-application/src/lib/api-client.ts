import { AppError } from '@/core/errors';

const API_URL = import.meta.env.VITE_DATA_SERVICE_URL || 'http://localhost:8788';
const API_TOKEN = import.meta.env.VITE_API_TOKEN;

const getHeaders = (): HeadersInit => {
	const headers: HeadersInit = { 'Content-Type': 'application/json' };
	if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`;
	return headers;
};

interface ErrorBody {
	error?: string;
	code?: string;
}

export async function handleResponse<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const body: ErrorBody = await response.json().catch(() => ({}));
		throw new AppError(body.error || 'Request failed', response.status, body.code);
	}
	return response.json();
}

export async function apiGet<T>(path: string): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		method: 'GET',
		headers: getHeaders(),
	});
	return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, data: unknown): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		method: 'POST',
		headers: getHeaders(),
		body: JSON.stringify(data),
	});
	return handleResponse<T>(response);
}

export async function apiPut<T>(path: string, data: unknown): Promise<T> {
	const response = await fetch(`${API_URL}${path}`, {
		method: 'PUT',
		headers: getHeaders(),
		body: JSON.stringify(data),
	});
	return handleResponse<T>(response);
}

export async function apiDelete(path: string): Promise<void> {
	const response = await fetch(`${API_URL}${path}`, {
		method: 'DELETE',
		headers: getHeaders(),
	});
	if (!response.ok) {
		const body: ErrorBody = await response.json().catch(() => ({}));
		throw new AppError(body.error || 'Delete failed', response.status, body.code);
	}
}
