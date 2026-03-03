import { Check, Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Locale } from '@/i18n/core/shared';
import {
	COOKIE_NAME,
	DEFAULT_LOCALE,
	extractLocaleFromPath,
	isIgnoredPath,
} from '@/i18n/core/shared';

const LOCALE_OPTIONS = [
	{ value: 'en' as const, label: 'English', flag: 'EN' },
	{ value: 'pl' as const, label: 'Polski', flag: 'PL' },
];

interface LanguageToggleProps {
	variant?: 'default' | 'outline' | 'ghost';
	align?: 'start' | 'center' | 'end';
}

export function LanguageToggle({ variant = 'ghost', align = 'end' }: LanguageToggleProps) {
	const t = useTranslations();
	const locale = useLocale();

	function setLocale(newLocale: Locale) {
		document.cookie = `${COOKIE_NAME}=${newLocale};path=/;samesite=lax;max-age=31536000`;

		if (isIgnoredPath(window.location.pathname)) {
			window.location.reload();
			return;
		}

		const currentLocale = extractLocaleFromPath(window.location.pathname);
		let path = window.location.pathname;

		// strip current locale prefix if present
		if (currentLocale) {
			path = path.replace(new RegExp(`^/${currentLocale}(/|$)`), '/');
		}

		// add new locale prefix (skip for default)
		if (newLocale !== DEFAULT_LOCALE) {
			path = `/${newLocale}${path}`;
		}

		window.location.href = path + window.location.hash;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant={variant}
					size="default"
					className="aspect-square hover:scale-105 active:scale-95"
					aria-label={t('lang.select')}
				>
					<Languages className="h-4 w-4 text-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="w-44">
				{LOCALE_OPTIONS.map((opt) => (
					<DropdownMenuItem
						key={opt.value}
						onClick={() => setLocale(opt.value)}
						className="flex items-center gap-3 cursor-pointer"
					>
						<span className="text-xs font-mono w-5">{opt.flag}</span>
						<span className="flex-1 text-sm">{opt.label}</span>
						{locale === opt.value && <Check className="h-4 w-4" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
