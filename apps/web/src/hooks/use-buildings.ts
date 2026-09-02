import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";

// ── Query Keys ──────────────────────────────────────────────────────────────

export const BUILDINGS_QUERY_KEY = ["buildings"] as const;
export const BUILDING_TYPES_QUERY_KEY = ["building-types"] as const;

import type {
  BuildingSummary,
  BuildingDetail,
  BuildingType,
  RealTimeData,
  HistoricalDataPoint,
  EfficiencyMetrics,
  SearchBuildingsQuery,
  GetBuildingHistoryQuery,
  GetBuildingEfficiencyQuery,
  CreateBuildingRequest,
  UpdateBuildingRequest,
} from "@wattguard/shared";

// ── Types (derived from @wattguard/shared schemas) ───────────────────────────

export type {
  BuildingSummary,
  BuildingDetail,
  BuildingType,
  RealTimeData,
  HistoricalDataPoint,
  EfficiencyMetrics,
  CreateBuildingRequest,
  UpdateBuildingRequest,
};

export type SearchBuildingsParams = SearchBuildingsQuery;
export type HistoryParams = GetBuildingHistoryQuery;
export type EfficiencyParams = GetBuildingEfficiencyQuery;

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
      const query: HistoryParams = {
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
    mutationFn: async (input: CreateBuildingRequest) => {
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
    mutationFn: async (input: UpdateBuildingRequest & { id: string }) => {
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
