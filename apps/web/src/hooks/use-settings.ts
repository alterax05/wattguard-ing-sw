import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";

// ── Query Key ────────────────────────────────────────────────────────────────

export const SETTINGS_QUERY_KEY = ["settings"] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface SystemConfig {
  polling: {
    intervalSeconds: number;
    autoPollingEnabled: boolean;
  };
  notifications: {
    emailEnabled: boolean;
  };
  database: {
    dataRetentionDays: number;
  };
}

export type UpdateSettingsInput = {
  polling?: Partial<SystemConfig["polling"]>;
  notifications?: Partial<SystemConfig["notifications"]>;
  database?: Partial<SystemConfig["database"]>;
};

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

      const data: { config: SystemConfig } = await res.json();
      return data.config;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
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

      const data: { success: true; config: SystemConfig } = await res.json();
      return data.config;
    },
    onSuccess: (updatedConfig) => {
      // Update the cache directly with the returned config
      queryClient.setQueryData(SETTINGS_QUERY_KEY, updatedConfig);
    },
  });
}
