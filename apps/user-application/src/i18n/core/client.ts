import { extractLocaleFromPath, isIgnoredPath, parseLocaleCookie, DEFAULT_LOCALE } from "./shared"
import type { Locale } from "./shared"

let _serverLocale: Locale = DEFAULT_LOCALE

export function setServerLocale(locale: Locale) {
  _serverLocale = locale
}

export function getServerLocale(): Locale {
  return _serverLocale
}

export function deLocalizeUrl({ url }: { url: URL }): URL {
  if (isIgnoredPath(url.pathname)) return url

  const locale = extractLocaleFromPath(url.pathname)
  if (!locale || locale === DEFAULT_LOCALE) return url

  const segments = url.pathname.split("/").filter(Boolean)
  segments.shift()
  const stripped = new URL(url)
  stripped.pathname = "/" + segments.join("/") || "/"
  return stripped
}

export function localizeUrl({ url }: { url: URL }): URL {
  if (isIgnoredPath(url.pathname)) return url

  const locale = getClientLocale()
  if (locale === DEFAULT_LOCALE) return url
  if (extractLocaleFromPath(url.pathname)) return url

  const prefixed = new URL(url)
  prefixed.pathname = `/${locale}${url.pathname}`
  return prefixed
}

export function getClientLocale(): Locale {
  if (typeof document === "undefined") return _serverLocale
  const fromPath = extractLocaleFromPath(window.location.pathname)
  if (fromPath) return fromPath
  return parseLocaleCookie(document.cookie) || DEFAULT_LOCALE
}
