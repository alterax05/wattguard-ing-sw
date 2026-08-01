import { hc } from "hono/client";
import type { AppType } from "@/index";

export const client = hc<AppType>(import.meta.env.VITE_FRONTEND_URL!, {
  init: {
    credentials: "include",
  },
});
