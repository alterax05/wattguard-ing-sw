import { hc } from "hono/client";
import type { AppType } from "@wattguard/api";
import { getRequestLocale } from "./i18n";

export const TOKEN_KEY = "wattguard-access-token";

export const client = hc<AppType>(window.location.origin, {
  headers: () => {
    const base = { "Accept-Language": getRequestLocale() } satisfies Record<string, string>;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return base;
    return { ...base, Authorization: `Bearer ${token}` } satisfies Record<string, string>;
  },
});
