import { createIsomorphicFn } from "@tanstack/react-start"
import {
  extractLocaleFromPath, isIgnoredPath,
  parseLocaleCookie, DEFAULT_LOCALE,
} from "./core/shared"
import { getServerLocale } from "./core/client"

export const getCurrentLocale = createIsomorphicFn()
  .server(() => {
    return getServerLocale()
  })
  .client(() => {
    if (isIgnoredPath(window.location.pathname)) {
      return parseLocaleCookie(document.cookie) || DEFAULT_LOCALE
    }
    return extractLocaleFromPath(window.location.pathname) || DEFAULT_LOCALE
  })
