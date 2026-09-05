import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";

// ── Query Key ────────────────────────────────────────────────────────────────

export const SETTINGS_QUERY_KEY = ["settings"] as const;

import type {
  SystemConfig,
  UpdateSettingsRequest as UpdateSettingsInput,
} from "@wattguard/shared";

// ── Types (derived from @wattguard/shared schemas) ───────────────────────────

export type { SystemConfig, UpdateSettingsInput };

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch the current system configuration.
 * GET /api/settings
 */
export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await client.api.v1.settings.$get();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

/**
 * Resolves the dynamic polling/refresh interval in milliseconds based on the
 * system configuration.
 *
 * - Returns `intervalSeconds * 1000` when auto-polling is enabled.
 * - Returns `false` when auto-polling is disabled (stops React Query background polling).
 * - Falls back to `fallbackMs` (default 90s) while settings are loading or if unavailable.
 */
export function usePollingInterval(
  fallbackMs: number = 90 * 1000,
): number | false {
  const { data: settings } = useSettings();

  if (!settings) {
    return fallbackMs;
  }

  return settings.polling.autoPollingEnabled
    ? settings.polling.intervalSeconds * 1000
    : false;
}

/**
 * Update the system configuration.
 * PATCH /api/settings
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateSettingsInput) => {
      const res = await client.api.v1.settings.$patch({
        json: input,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
    onSuccess: (updatedConfig) => {
      // Update the cache directly with the returned config
      queryClient.setQueryData(SETTINGS_QUERY_KEY, updatedConfig);
    },
  });
}
