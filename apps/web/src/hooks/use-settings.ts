import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as Record<string, unknown>).error;
    return typeof err === "string" ? err : fallback;
  }
  return fallback;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch the current system configuration.
 * GET /api/settings
 */
export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await client.api.settings.$get();

      if (!res.ok) {
        const data = await res.json();
        throw new Error(
          extractError(data, "Errore nel caricamento delle impostazioni"),
        );
      }

      const data = await res.json();
      return (data as { config: SystemConfig }).config;
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
      const res = await client.api.settings.$patch({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          extractError(data, "Errore nel salvataggio delle impostazioni"),
        );
      }

      return (data as { success: true; config: SystemConfig }).config;
    },
    onSuccess: (updatedConfig) => {
      // Update the cache directly with the returned config
      queryClient.setQueryData(SETTINGS_QUERY_KEY, updatedConfig);
    },
  });
}
