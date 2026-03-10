---
name: i18n
description: Internationalization with use-intl: adding translation keys, locale strategy, hydration safety, and component checklist. Use when adding user-facing strings, creating components, or working with i18n in user-application.
---

# i18n (use-intl)

## Adding Strings

1. Add key to **both** `i18n/messages/en.json` and `i18n/messages/pl.json`
2. Use nested JSON: `{ "section": { "label": "value" } }`
3. Access via dot notation: `t("section.label")`
4. A key cannot be both a string and a parent object — use `.label` sub-key
5. ICU format for plurals: `"{count, plural, one {# item} other {# items}}"`

## Key Naming

```
{section}.{subsection}.{element}

nav.features          # navigation
hero.title.part1      # hero section
faq.beginner.q1       # FAQ question
meta.title            # page meta
```

## Never Translate

- Brand: `notdemo.trade`
- External services: OpenAI, Anthropic, etc.
- URL slugs and route paths

## Locale Strategy

- **Public pages**: URL path — no prefix = EN, `/pl/` = Polish
- **Auth/dashboard** (`/app/*`, `/api/*`): locale from cookie, never URL-prefixed

## New Component Checklist

1. `import { useTranslations } from 'use-intl'`
2. Add keys to both `en.json` and `pl.json`
3. Never hardcode user-facing strings

## Hydration Safety

- Never use `typeof window` or `typeof document` for locale detection
- Locale flows: `beforeLoad` → route context → `IntlProvider`
- Messages loaded via `useSuspenseQuery` — never render without messages

## Config Locations

- Types/constants: `i18n/core/shared.ts` (`Locale`, `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`)
- Messages: `apps/user-application/src/i18n/messages/`
