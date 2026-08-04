import { hc } from "hono/client";
import type { AppType } from "@/index";

export const client = hc<AppType>(window.location.origin, {
  init: {
    credentials: "include",
  },
});
