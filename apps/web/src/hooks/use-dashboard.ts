import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { usePollingInterval } from "./use-settings";

// ── Query Keys ───────────────────────────────────────────────────────────────

export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

import type { MetricsHistoryQuery as MetricsHistoryParams } from "@wattguard/shared";

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch aggregated dashboard statistics.
 * GET /api/v1/metrics
 *
 * The refetch interval is driven by the system configuration's polling settings.
 * Falls back to 2 minutes if settings have not yet loaded.
 */
export function useDashboardStats() {
  const intervalMs = usePollingInterval(2 * 60 * 1000);

  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "stats"],
    queryFn: async () => {
      const res = await client.api.v1.metrics.$get();
      if (!res.ok) {
        throw new Error("Failed to fetch dashboard stats");
      }
      const resData = await res.json();
      return resData.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: intervalMs,
  });
}

/**
 * Fetch aggregated historical energy/gas data for the dashboard chart.
 * GET /api/v1/metrics/timeseries
 */
export function useDashboardHistory(params: MetricsHistoryParams) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, "history", params],
    queryFn: async () => {
      const query: MetricsHistoryParams = {
        startDate: params.startDate,
        endDate: params.endDate,
      };
      if (params.interval) {
        query.interval = params.interval;
      }
      const res = await client.api.v1.metrics.timeseries.$get({ query });
      if (!res.ok) {
        throw new Error("Failed to fetch dashboard history");
      }
      const resData = await res.json();
      return resData.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!params.startDate && !!params.endDate,
  });
}
