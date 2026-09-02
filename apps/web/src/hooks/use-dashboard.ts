import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { useSettings } from "./use-settings";

// ── Query Keys ───────────────────────────────────────────────────────────────

export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

import type {
  DashboardStats,
  DashboardHistoryDataPoint,
  DashboardHistory,
  DashboardHistoryQuery as DashboardHistoryParams,
} from "@wattguard/shared";

// ── Types (derived from @wattguard/shared schemas) ───────────────────────────

export type {
  DashboardStats,
  DashboardHistoryDataPoint,
  DashboardHistory,
  DashboardHistoryParams,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch aggregated dashboard statistics.
 * GET /api/dashboard/stats
 *
 * The refetch interval is driven by the system configuration's polling settings.
 * Falls back to 2 minutes if settings have not yet loaded.
 */
export function useDashboardStats() {
  const { data: settings } = useSettings();

  const intervalMs: number | false = settings
    ? settings.polling.autoPollingEnabled
      ? settings.polling.intervalSeconds * 1000
      : false
    : 2 * 60 * 1000; // default while settings load

  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "stats"],
    queryFn: async () => {
      const res = await client.api.v1.dashboard.stats.$get();
      if (!res.ok) {
        throw new Error("Failed to fetch dashboard stats");
      }
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: intervalMs,
  });
}

/**
 * Fetch aggregated historical energy/gas data for the dashboard chart.
 * GET /api/dashboard/history
 */
export function useDashboardHistory(params: DashboardHistoryParams) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "history", params],
    queryFn: async () => {
      const query: DashboardHistoryParams = {
        startDate: params.startDate,
        endDate: params.endDate,
      };
      if (params.interval) {
        query.interval = params.interval;
      }
      const res = await client.api.v1.dashboard.history.$get({ query });
      if (!res.ok) {
        throw new Error("Failed to fetch dashboard history");
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!params.startDate && !!params.endDate,
  });
}
