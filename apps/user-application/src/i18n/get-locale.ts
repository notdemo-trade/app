import { createIsomorphicFn } from '@tanstack/react-start';
import { getServerLocale } from './core/client';
import {
	DEFAULT_LOCALE,
	extractLocaleFromPath,
	isIgnoredPath,
	parseLocaleCookie,
} from './core/shared';

export const getCurrentLocale = createIsomorphicFn()
	.server(() => {
		return getServerLocale();
	})
	.client(() => {
		if (isIgnoredPath(window.location.pathname)) {
			return parseLocaleCookie(document.cookie) || DEFAULT_LOCALE;
		}
		return extractLocaleFromPath(window.location.pathname) || DEFAULT_LOCALE;
	});
