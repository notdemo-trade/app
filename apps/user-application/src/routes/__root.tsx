/// <reference types="vite/client" />

import type { QueryClient } from '@tanstack/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type * as React from 'react';
import { IntlProvider } from 'use-intl';
import { DefaultCatchBoundary } from '@/components/default-catch-boundary';
import { NotFound } from '@/components/not-found';
import { ThemeProvider } from '@/components/theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Locale } from '@/i18n/core/shared';
import { getCurrentLocale } from '@/i18n/get-locale';
import { messagesQueryOptions } from '@/i18n/messages';
import appCss from '@/styles.css?url';
import { seo } from '@/utils/seo';

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	beforeLoad: () => {
		const locale = getCurrentLocale();
		return { locale };
	},
	head: ({ match }) => {
		const locale = match.context.locale as Locale;
		const isPl = locale === 'pl';
		return {
			meta: [
				{
					charSet: 'utf-8',
				},
				{
					name: 'viewport',
					content: 'width=device-width, initial-scale=1',
				},
				...seo({
					title: isPl ? 'notdemo.trade - Bot Handlowy AI' : 'notdemo.trade - AI Trading Bot',
					description: isPl
						? 'Bot handlowy AI, ktory monitoruje media spolecznosciowe, generuje rekomendacje 24/7 i pozwala zatwierdzac je z telefonu.'
						: 'AI trading bot that watches social media, makes trade recommendations 24/7, and lets you approve them from your phone.',
				}),
			],
			links: [
				{
					rel: 'preconnect',
					href: 'https://fonts.googleapis.com',
				},
				{
					rel: 'preconnect',
					href: 'https://fonts.gstatic.com',
					crossOrigin: 'anonymous',
				},
				{
					rel: 'stylesheet',
					href: 'https://fonts.googleapis.com/css2?family=Oxanium:wght@200..800&family=Source+Code+Pro:ital,wght@0,200..900;1,200..900&display=swap',
				},
				{ rel: 'stylesheet', href: appCss },
				{
					rel: 'apple-touch-icon',
					sizes: '192x192',
					href: '/logo192.png',
				},
				{ rel: 'manifest', href: '/manifest.json' },
				{ rel: 'icon', href: '/favicon.ico' },
			],
		};
	},
	errorComponent: (props) => {
		return (
			<RootDocument>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange={false}
				>
					<DefaultCatchBoundary {...props} />
				</ThemeProvider>
			</RootDocument>
		);
	},
	notFoundComponent: () => <NotFound />,
	component: RootComponent,
});

function RootComponent() {
	const { locale } = Route.useRouteContext();
	const { data: messages } = useSuspenseQuery(messagesQueryOptions(locale));

	return (
		<RootDocument locale={locale}>
			<IntlProvider locale={locale} messages={messages as Record<string, unknown>} timeZone="UTC">
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange={false}
				>
					<TooltipProvider>
						<Outlet />
					</TooltipProvider>
				</ThemeProvider>
			</IntlProvider>
		</RootDocument>
	);
}

function RootDocument({ children, locale = 'en' }: { children: React.ReactNode; locale?: Locale }) {
	return (
		<html lang={locale}>
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<TanStackRouterDevtools position="bottom-right" />
				<ReactQueryDevtools buttonPosition="bottom-left" />
				<Scripts />
			</body>
		</html>
	);
}
