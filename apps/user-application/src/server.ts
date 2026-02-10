// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom server entry is working
import { setAuth } from "@repo/data-ops/auth/server";
import { getDb, initDatabase } from "@repo/data-ops/database/setup";
import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";
import { handleLocaleMiddleware } from "@/i18n/core/server";
import { setServerLocale } from "@/i18n/core/client";
import { extractLocaleFromPath, parseLocaleCookie, DEFAULT_LOCALE, SUPPORTED_LOCALES, isIgnoredPath } from "@/i18n/core/shared";
import type { Locale } from "@/i18n/core/shared";

console.log("[server-entry]: using custom server entry in 'src/server.ts'");

export default {
  fetch(request: Request) {
    initDatabase({
      host: env.DATABASE_HOST,
      username: env.DATABASE_USERNAME,
      password: env.DATABASE_PASSWORD,
    });

    setAuth({
      baseURL: new URL(request.url).origin,
      secret: env.BETTER_AUTH_SECRET,
      adapter: {
        drizzleDb: getDb(),
        provider: "pg",
      },
    });

    const localeResult = handleLocaleMiddleware(request);
    if (localeResult.redirect) return localeResult.redirect;

    const url = new URL(request.url);
    const pathLocale = extractLocaleFromPath(url.pathname);
    const cookieLocale = parseLocaleCookie(request.headers.get("cookie") || "");
    let resolvedLocale: Locale = pathLocale || cookieLocale || DEFAULT_LOCALE;

    // Accept-Language auto-detect on first visit (no prefix, no cookie, public page)
    if (!pathLocale && !cookieLocale && !isIgnoredPath(url.pathname)) {
      const acceptLang = request.headers.get("accept-language") || "";
      const browserLocale = acceptLang
        .split(",")
        .map((part) => part.split(";")[0]!.trim().substring(0, 2))
        .find((code) => SUPPORTED_LOCALES.includes(code as Locale));
      if (browserLocale) resolvedLocale = browserLocale as Locale;
    }

    setServerLocale(resolvedLocale);

    const result = handler.fetch(request, {
      context: {
        fromFetch: true,
      },
    });

    if (localeResult.setCookieHeader) {
      return Promise.resolve(result).then((response: Response) => {
        response.headers.append("set-cookie", localeResult.setCookieHeader!);
        return response;
      });
    }

    return result;
  },
};
