import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";
import { usePollingInterval } from "./use-settings";

// ── Query Keys ──────────────────────────────────────────────────────────────

export const BUILDINGS_QUERY_KEY = ["buildings"] as const;

// Building-type queries/mutations live in their own deep module; re-exported
// here so existing `use-buildings` imports keep working.
export { BUILDING_TYPES_QUERY_KEY, useBuildingTypes } from "./use-building-types";

import type {
  SearchBuildingsQuery,
  GetBuildingHistoryQuery,
  GetBuildingEfficiencyQuery,
  CreateBuildingRequest,
  UpdateBuildingRequest,
  WithId,
} from "@wattguard/shared";

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Fetch buildings list with optional search/filter params.
 * GET /api/buildings
 */
export function useBuildings(params?: SearchBuildingsQuery) {
  return useQuery({
    queryKey: [...BUILDINGS_QUERY_KEY, "list", params ?? {}],
    queryFn: async () => {
      const query: SearchBuildingsQuery = {};
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

      const resData = await res.json();
      return resData.data;
    },
    staleTime: 2 * 60 * 1000,
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

      const resData = await res.json();
      return resData.data;
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Latest-point snapshot for a building, built client-side from
 * GET /api/v1/buildings/:id/readings?limit=1&sortOrder=desc per sensor type.
 */
export interface BuildingRealTimeSnapshot {
  buildingId: string;
  buildingName: string;
  timestamp: string;
  data: {
    internalTemperature: { value: number | null; unit: string; timestamp: string | null; sensorId: string | null };
    externalTemperature: { value: number | null; unit: string; timestamp: string | null; sensorId: string | null };
    energyConsumption: { value: number | null; unit: string; timestamp: string | null; sensorId: string | null };
  };
}

/**
 * Fetch latest reading per sensor type for a building.
 * GET /api/v1/buildings/:id/readings?limit=1&sortOrder=desc
 */
export function useBuildingRealTime(id: string | undefined) {
  const refetchInterval = usePollingInterval();

  return useQuery({
    queryKey: [...BUILDINGS_QUERY_KEY, "real-time", id],
    queryFn: async (): Promise<BuildingRealTimeSnapshot> => {
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const fetchLatest = async (sensorType: "internal_temp" | "external_temp" | "energy_meter") => {
        const res = await client.api.v1.buildings[":id"].readings.$get({
          param: { id: id! },
          query: { startDate, endDate, sensorType, limit: "1", sortOrder: "desc" },
        });

        if (!res.ok) {
          throw new Error(await errorMessageFromResponse(res));
        }

        const resData = await res.json();
        return resData.data.data[0];
      };

      const [internal, external, energy] = await Promise.all([
        fetchLatest("internal_temp"),
        fetchLatest("external_temp"),
        fetchLatest("energy_meter"),
      ]);

      const buildingRes = await client.api.v1.buildings[":id"].$get({
        param: { id: id! },
      });
      let buildingName = "";
      if (buildingRes.ok) {
        const buildingData = await buildingRes.json();
        buildingName = buildingData.data.name ?? "";
      }

      return {
        buildingId: id!,
        buildingName,
        timestamp: new Date().toISOString(),
        data: {
          internalTemperature: {
            value: internal?.value ?? null,
            unit: internal?.unit ?? "°C",
            timestamp: internal?.timestamp ?? null,
            sensorId: internal?.sensorId ?? null,
          },
          externalTemperature: {
            value: external?.value ?? null,
            unit: external?.unit ?? "°C",
            timestamp: external?.timestamp ?? null,
            sensorId: external?.sensorId ?? null,
          },
          energyConsumption: {
            value: energy?.value ?? null,
            unit: energy?.unit ?? "kW",
            timestamp: energy?.timestamp ?? null,
            sensorId: energy?.sensorId ?? null,
          },
        },
      };
    },
    enabled: !!id,
    refetchInterval,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch historical data for a building.
 * GET /api/v1/buildings/:id/readings
 */
export function useBuildingHistory(id: string | undefined, params: GetBuildingHistoryQuery | undefined) {
  return useQuery({
    queryKey: [...BUILDINGS_QUERY_KEY, "history", id, params],
    queryFn: async () => {
      const query: GetBuildingHistoryQuery = {
        startDate: params!.startDate,
        endDate: params!.endDate,
      };
      if (params!.sensorType) query.sensorType = params!.sensorType;
      if (params!.interval) query.interval = params!.interval;
      if (params!.limit !== undefined) query.limit = String(params!.limit);
      if (params!.sortOrder) query.sortOrder = params!.sortOrder;

      const res = await client.api.v1.buildings[":id"].readings.$get({
        param: { id: id! },
        query,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
    enabled: !!id && !!params?.startDate && !!params?.endDate,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch efficiency metrics for a building.
 * GET /api/buildings/:id/efficiency
 */
export function useBuildingEfficiency(id: string | undefined, params: GetBuildingEfficiencyQuery | undefined) {
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

      const resData = await res.json();
      return resData.data;
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

      const resData = await res.json();
      return resData.data;
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
    mutationFn: async (input: WithId<UpdateBuildingRequest>) => {
      const { id, ...body } = input;
      const res = await client.api.v1.buildings[":id"].$patch({
        param: { id },
        json: body,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
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

      const resData = await res.json();
      return resData.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
    },
  });
}
