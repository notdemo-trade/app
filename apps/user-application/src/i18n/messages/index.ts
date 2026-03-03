import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { Locale } from '../core/shared';
import en from './en.json';
import pl from './pl.json';

type JsonValue = string | number | boolean | null | JsonObject;
interface JsonObject {
	[key: string]: JsonValue;
}

const messagesByLocale: Record<Locale, JsonObject> = { en, pl };

export const getMessages = createServerFn({ method: 'GET' })
	.inputValidator(z.object({ locale: z.enum(['en', 'pl']) }))
	.handler(({ data }): JsonObject => {
		return messagesByLocale[data.locale];
	});

export const messagesQueryOptions = (locale: Locale) =>
	queryOptions({
		queryKey: ['i18n', 'messages', locale],
		queryFn: () => getMessages({ data: { locale } }),
		staleTime: Infinity,
	});
