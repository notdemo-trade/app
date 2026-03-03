import { COOKIE_NAME, DEFAULT_LOCALE, isIgnoredPath, isValidLocale } from './shared';

interface MiddlewareResult {
	redirect?: Response;
	setCookieHeader?: string;
}

export function handleLocaleMiddleware(request: Request): MiddlewareResult {
	const url = new URL(request.url);
	const pathSegments = url.pathname.split('/').filter(Boolean);
	const firstSegment = pathSegments[0];

	if (isIgnoredPath(url.pathname)) return {};

	// redirect /en/* -> /* (default locale not prefixed)
	if (firstSegment === DEFAULT_LOCALE) {
		url.pathname = '/' + pathSegments.slice(1).join('/') || '/';
		return { redirect: Response.redirect(url.toString(), 308) };
	}

	// redirect /pl/app/* -> /app/* (ignored path with locale prefix)
	if (isValidLocale(firstSegment)) {
		const restPath = '/' + pathSegments.slice(1).join('/');
		if (isIgnoredPath(restPath)) {
			url.pathname = restPath;
			return { redirect: Response.redirect(url.toString(), 308) };
		}
		return {
			setCookieHeader: `${COOKIE_NAME}=${firstSegment};path=/;samesite=lax;max-age=31536000`,
		};
	}

	return {};
}
