import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

// ── Query Keys ──────────────────────────────────────────────────────────────

export const BUILDINGS_QUERY_KEY = ["buildings"] as const;
export const BUILDING_TYPES_QUERY_KEY = ["building-types"] as const;

// ── Types ───────────────────────────────────────────────────────────────────

export interface BuildingSummary {
  id: string;
  name: string;
  address: string;
  surface: number;
  ceilingHeight: number;
  location: { type: "Point"; coordinates: [number, number] };
  buildingType: string | { id: string; name: string; description?: string };
  heatingSystemType: string;
  status: "active" | "inactive" | "decommissioned";
  geographicZone: string;
  activeSensors: number;
  currentConsumption: number | null;
  updatedAt: string;
}

export interface BuildingDetail extends BuildingSummary {
  constructionYear?: number;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  efficiencyThresholds?: { enabled: boolean; minCop: number | null };
}

export interface BuildingType {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RealTimeData {
  buildingId: string;
  buildingName: string;
  timestamp: string;
  data: {
    internalTemperature: {
      value: number | null;
      unit: string;
      timestamp: string | null;
      sensorId: string | null;
    };
    externalTemperature: {
      value: number | null;
      unit: string;
      timestamp: string | null;
      sensorId: string | null;
    };
    energyConsumption: {
      value: number | null;
      unit: string;
      timestamp: string | null;
      sensorId: string | null;
    };
  };
}

export interface HistoricalDataPoint {
  timestamp: string;
  value: number;
  unit: string;
  sensorType: string;
  sensorId?: string;
}

export interface EfficiencyMetrics {
  buildingId: string;
  buildingName: string;
  period: {
    startDate: string;
    endDate: string;
  };
  metrics: {
    totalEnergyConsumed: number;
    averageExternalTemperature: number | null;
    estimatedHeatLossCoefficient: number | null;
    insulationQuality: number | null;
    averageCop: number | null;
  };
}

// ── Search params ───────────────────────────────────────────────────────────

export interface SearchBuildingsParams {
  name?: string;
  address?: string;
  zone?: string;
  buildingType?: string;
  status?: "active" | "inactive" | "decommissioned";
  sortBy?: "name" | "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  limit?: string;
  offset?: string;
}

export interface HistoryParams {
  startDate: string;
  endDate: string;
  sensorType?: "internal_temp" | "external_temp" | "energy_meter" | "gas_meter";
  interval?: "minute" | "hour" | "day";
}

export interface EfficiencyParams {
  startDate: string;
  endDate: string;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Fetch buildings list with optional search/filter params.
 * GET /api/buildings
 */
export function useBuildings(params?: SearchBuildingsParams) {
  return useQuery({
    queryKey: [...BUILDINGS_QUERY_KEY, "list", params ?? {}],
    queryFn: async () => {
      const res = await client.api.buildings.$get({
        query: {
          ...(params?.name ? { name: params.name } : {}),
          ...(params?.address ? { address: params.address } : {}),
          ...(params?.zone ? { zone: params.zone } : {}),
          ...(params?.buildingType ? { buildingType: params.buildingType } : {}),
          ...(params?.status ? { status: params.status } : {}),
          ...(params?.sortBy ? { sortBy: params.sortBy } : {}),
          ...(params?.sortOrder ? { sortOrder: params.sortOrder } : {}),
          ...(params?.limit ? { limit: params.limit } : {}),
          ...(params?.offset ? { offset: params.offset } : {}),
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(errorMessage(data));
      }

      const data = await res.json();
      return data as {
        buildings: BuildingSummary[];
        pagination: { limit: number; offset: number; total: number };
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch all building types.
 * GET /api/building-types
 */
export function useBuildingTypes() {
  return useQuery({
    queryKey: BUILDING_TYPES_QUERY_KEY,
    queryFn: async () => {
      const res = await client.api["building-types"].$get();

      if (!res.ok) {
        const data = await res.json();
        throw new Error(errorMessage(data));
      }

      const data = await res.json();
      return data as { buildingTypes: BuildingType[] };
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch a single building by ID.
 * GET /api/buildings/:id
 */
export function useBuilding(id: string | undefined) {
  return useQuery({
    queryKey: [...BUILDINGS_QUERY_KEY, "detail", id],
    queryFn: async () => {
      const res = await client.api.buildings[":id"].$get({
        param: { id: id! },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(errorMessage(data));
      }

      const data = await res.json();
      return data as { building: BuildingDetail };
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Fetch real-time data for a building.
 * GET /api/buildings/:id/real-time
 */
export function useBuildingRealTime(id: string | undefined) {
  return useQuery({
    queryKey: [...BUILDINGS_QUERY_KEY, "real-time", id],
    queryFn: async () => {
      const res = await client.api.buildings[":id"]["real-time"].$get({
        param: { id: id! },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(errorMessage(data));
      }

      const data = await res.json();
      return data as RealTimeData;
    },
    enabled: !!id,
    refetchInterval: 90 * 1000, // Refetch every 90 seconds (sensor transmission interval)
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch historical data for a building.
 * GET /api/buildings/:id/history
 */
export function useBuildingHistory(id: string | undefined, params: HistoryParams | undefined) {
  return useQuery({
    queryKey: [...BUILDINGS_QUERY_KEY, "history", id, params],
    queryFn: async () => {
      const res = await client.api.buildings[":id"].history.$get({
        param: { id: id! },
        query: {
          startDate: params!.startDate,
          endDate: params!.endDate,
          ...(params!.sensorType ? { sensorType: params!.sensorType } : {}),
          ...(params!.interval ? { interval: params!.interval } : {}),
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(errorMessage(data));
      }

      const data = await res.json();
      return data as {
        buildingId: string;
        buildingName: string;
        period: { startDate: string; endDate: string };
        data: HistoricalDataPoint[];
      };
    },
    enabled: !!id && !!params?.startDate && !!params?.endDate,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch efficiency metrics for a building.
 * GET /api/buildings/:id/efficiency
 */
export function useBuildingEfficiency(id: string | undefined, params: EfficiencyParams | undefined) {
  return useQuery({
    queryKey: [...BUILDINGS_QUERY_KEY, "efficiency", id, params],
    queryFn: async () => {
      const res = await client.api.buildings[":id"].efficiency.$get({
        param: { id: id! },
        query: {
          startDate: params!.startDate,
          endDate: params!.endDate,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(errorMessage(data));
      }

      const data = await res.json();
      return data as EfficiencyMetrics;
    },
    enabled: !!id && !!params?.startDate && !!params?.endDate,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

/**
 * Create a new building.
 * POST /api/buildings
 */
export function useCreateBuilding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      address: string;
      surface: number;
      ceilingHeight: number;
      location: { type: "Point"; coordinates: [number, number] };
      buildingType: string;
      heatingSystemType: string;
      constructionYear?: number;
      geographicZone: string;
    }) => {
      const res = await client.api.buildings.$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(errorMessage(data));
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
    },
  });
}

/**
 * Update a building.
 * PATCH /api/buildings/:id
 */
export function useUpdateBuilding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      address?: string;
      surface?: number;
      ceilingHeight?: number;
      location?: { type: "Point"; coordinates: [number, number] };
      buildingType?: string;
      heatingSystemType?: string;
      constructionYear?: number;
      geographicZone?: string;
      status?: "active" | "inactive" | "decommissioned";
      efficiencyThresholds?: { enabled: boolean; minCop: number | null };
    }) => {
      const { id, ...body } = input;
      const res = await client.api.buildings[":id"].$patch({
        param: { id },
        json: body,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(errorMessage(data));
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
    },
  });
}

/**
 * Delete a building.
 * DELETE /api/buildings/:id
 */
export function useDeleteBuilding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.api.buildings[":id"].$delete({
        param: { id },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(errorMessage(data));
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
    },
  });
}
