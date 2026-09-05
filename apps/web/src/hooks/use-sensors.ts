import {
  useQuery,
  useMutation,
  useQueryClient,
  type PlaceholderDataFunction,
} from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";
import { BUILDINGS_QUERY_KEY } from "./use-buildings";
import { DASHBOARD_QUERY_KEY } from "./use-dashboard";

// ── Query Keys ──────────────────────────────────────────────────────────────

export const SENSORS_QUERY_KEY = ["sensors"] as const;
const SENSOR_PAGE_SIZE = 100;

import type {
  ListSensorsQuery,
  ListSensorsResponse,
  GetSensorReadingsQuery,
  CreateSensorRequest,
  UpdateSensorRequest,
  WithId,
} from "@wattguard/shared";

export type SensorListData = ListSensorsResponse["data"];

export interface UseSensorsOptions {
  refetchInterval?: number | false;
  placeholderData?: PlaceholderDataFunction<SensorListData> | SensorListData;
}

// ── Queries ─────────────────────────────────────────────────────────────────

async function fetchSensorPage(params?: ListSensorsQuery): Promise<SensorListData> {
  const query: ListSensorsQuery = {};
  if (params?.building) query.building = params.building;
  if (params?.sensorType) query.sensorType = params.sensorType;
  if (params?.status) query.status = params.status;
  if (params?.sortBy) query.sortBy = params.sortBy;
  if (params?.sortOrder) query.sortOrder = params.sortOrder;
  if (params?.limit) query.limit = params.limit;
  if (params?.offset) query.offset = params.offset;

  const res = await client.api.v1.sensors.$get({ query });

  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res));
  }

  const json = await res.json();
  return json.data;
}

/**
 * Fetch all sensors with optional filters.
 * GET /api/sensors
 */
export function useSensors(params?: ListSensorsQuery, options?: UseSensorsOptions) {
  return useQuery({
    queryKey: [...SENSORS_QUERY_KEY, "list", params ?? {}],
    queryFn: () => fetchSensorPage(params),
    staleTime: 60 * 1000,
    refetchInterval: options?.refetchInterval ?? false,
    placeholderData: options?.placeholderData,
  });
}

/**
 * Fetch the complete sensor catalog (following the API pagination limit),
 * optionally filtered by the provided params (e.g. buildingId).
 * GET /api/sensors
 */
export function useAllSensors(params?: ListSensorsQuery, options?: UseSensorsOptions) {
  return useQuery({
    queryKey: [...SENSORS_QUERY_KEY, "all", params ?? {}],
    queryFn: async () => {
      const firstPage = await fetchSensorPage({ ...params, limit: String(SENSOR_PAGE_SIZE) });
      const pageCount = Math.ceil(firstPage.pagination.total / SENSOR_PAGE_SIZE);

      if (pageCount <= 1) return firstPage;

      const remainingPages = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, pageIndex) =>
          fetchSensorPage({
            ...params,
            limit: String(SENSOR_PAGE_SIZE),
            offset: String((pageIndex + 1) * SENSOR_PAGE_SIZE),
          }),
        ),
      );

      return {
        sensors: [firstPage, ...remainingPages].flatMap((page) => page.sensors),
        pagination: {
          limit: firstPage.pagination.total,
          offset: 0,
          total: firstPage.pagination.total,
        },
      };
    },
    staleTime: 60 * 1000,
    refetchInterval: options?.refetchInterval ?? false,
  });
}

/**
 * Fetch a single sensor by ID.
 * GET /api/sensors/:id
 */
export function useSensor(id: string | undefined) {
  return useQuery({
    queryKey: [...SENSORS_QUERY_KEY, "detail", id],
    queryFn: async () => {
      const res = await client.api.v1.sensors[":id"].$get({
        param: { id: id! },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const data = await res.json();
      return data.data;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch readings for a sensor.
 * GET /api/sensors/:id/readings
 */
export function useSensorReadings(id: string | undefined, params?: GetSensorReadingsQuery) {
  return useQuery({
    queryKey: [...SENSORS_QUERY_KEY, "readings", id, params ?? {}],
    queryFn: async () => {
      const query: GetSensorReadingsQuery = {};
      if (params?.startDate) query.startDate = params.startDate;
      if (params?.endDate) query.endDate = params.endDate;
      if (params?.sortOrder) query.sortOrder = params.sortOrder;
      if (params?.limit) query.limit = params.limit;
      if (params?.offset) query.offset = params.offset;

      const res = await client.api.v1.sensors[":id"].readings.$get({
        param: { id: id! },
        query,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const data = await res.json();
      return data.data;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

/**
 * Create a new sensor.
 * POST /api/sensors
 */
export function useCreateSensor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSensorRequest) => {
      const res = await client.api.v1.sensors.$post({
        json: input,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
    },
  });
}

/**
 * Update a sensor.
 * PATCH /api/sensors/:id
 */
export function useUpdateSensor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: WithId<UpdateSensorRequest>) => {
      const { id, ...body } = input;
      const res = await client.api.v1.sensors[":id"].$patch({
        param: { id },
        json: body,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}

/**
 * Delete a sensor.
 * DELETE /api/sensors/:id
 */
export function useDeleteSensor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.sensors[":id"].$delete({
        param: { id },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const data = await res.json();
      return data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}
