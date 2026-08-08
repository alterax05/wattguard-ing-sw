import { useQuery } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { useSettings } from "./use-settings";

// ── Query Keys ───────────────────────────────────────────────────────────────

export const DASHBOARD_QUERY_KEY = ["dashboard"] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  sensors: {
    active: number;
    total: number;
  };
  alerts: {
    active: number;
  };
  consumption: {
    electricity: number | null;
    gas: number | null;
  };
}

export interface DashboardHistoryDataPoint {
  date: string;
  electricity: number | null;
  gas: number | null;
}

export interface DashboardHistory {
  period: {
    startDate: string;
    endDate: string;
    interval: "hour" | "day" | "week";
  };
  data: DashboardHistoryDataPoint[];
}

export interface DashboardHistoryParams {
  startDate: string;
  endDate: string;
  interval?: "hour" | "day" | "week";
}

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
      const res = await client.api.dashboard.stats.$get();
      if (!res.ok) {
        throw new Error("Failed to fetch dashboard stats");
      }
      return (await res.json()) as DashboardStats;
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
      const res = await client.api.dashboard.history.$get({
        query: {
          startDate: params.startDate,
          endDate: params.endDate,
          ...(params.interval ? { interval: params.interval } : {}),
        },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch dashboard history");
      }
      return (await res.json()) as DashboardHistory;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!params.startDate && !!params.endDate,
  });
}
