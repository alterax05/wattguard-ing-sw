import { hc } from "hono/client";
import type { AppType } from "@wattguard/api";
import { getRequestLocale } from "./i18n";

export const client = hc<AppType>(window.location.origin, {
  init: {
    credentials: "include",
  },
  headers: () => ({ "Accept-Language": getRequestLocale() }),
});
