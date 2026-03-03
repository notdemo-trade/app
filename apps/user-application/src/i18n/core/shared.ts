export type Locale = 'en' | 'pl';
export const SUPPORTED_LOCALES: Locale[] = ['en', 'pl'];
export const DEFAULT_LOCALE: Locale = 'en';
export const COOKIE_NAME = 'locale';
export const IGNORED_PATH_PREFIXES = ['/app', '/api', '/rpc', '/_auth'];

export function isValidLocale(value: string | undefined | null): value is Locale {
	return SUPPORTED_LOCALES.includes(value as Locale);
}

export function isIgnoredPath(pathname: string): boolean {
	return IGNORED_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export function extractLocaleFromPath(pathname: string): Locale | null {
	const firstSegment = pathname.split('/').filter(Boolean)[0];
	return isValidLocale(firstSegment) ? firstSegment : null;
}

export function parseLocaleCookie(cookieHeader: string): Locale | null {
	const match = cookieHeader.match(/(?:^|;\s*)locale=(\w+)/);
	return match && isValidLocale(match[1]) ? match[1] : null;
}
