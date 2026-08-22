import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";

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

/** Query contract for GET /api/buildings/:id/history. */
interface BuildingHistoryQuery {
  startDate: string;
  endDate: string;
  sensorType?: HistoryParams["sensorType"];
  interval?: HistoryParams["interval"];
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
      const query: SearchBuildingsParams = {};
      if (params?.name) query.name = params.name;
      if (params?.address) query.address = params.address;
      if (params?.zone) query.zone = params.zone;
      if (params?.buildingType) query.buildingType = params.buildingType;
      if (params?.status) query.status = params.status;
      if (params?.sortBy) query.sortBy = params.sortBy;
      if (params?.sortOrder) query.sortOrder = params.sortOrder;
      if (params?.limit) query.limit = params.limit;
      if (params?.offset) query.offset = params.offset;

      const res = await client.api.v1.buildings.$get({ query });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return res.json();
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
      const res = await client.api.v1["building-types"].$get();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return res.json();
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
      const res = await client.api.v1.buildings[":id"].$get({
        param: { id: id! },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return res.json();
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
      const res = await client.api.v1.buildings[":id"]["real-time"].$get({
        param: { id: id! },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return res.json();
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
      const query: BuildingHistoryQuery = {
        startDate: params!.startDate,
        endDate: params!.endDate,
      };
      if (params!.sensorType) query.sensorType = params!.sensorType;
      if (params!.interval) query.interval = params!.interval;

      const res = await client.api.v1.buildings[":id"].history.$get({
        param: { id: id! },
        query,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return res.json();
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
      const res = await client.api.v1.buildings[":id"].efficiency.$get({
        param: { id: id! },
        query: {
          startDate: params!.startDate,
          endDate: params!.endDate,
        },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return res.json();
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
      const res = await client.api.v1.buildings.$post({
        json: input,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
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
      const res = await client.api.v1.buildings[":id"].$patch({
        param: { id },
        json: body,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
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
      const res = await client.api.v1.buildings[":id"].$delete({
        param: { id },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
    },
  });
}
