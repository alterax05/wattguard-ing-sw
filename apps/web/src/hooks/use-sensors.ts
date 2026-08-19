import {
  useQuery,
  useMutation,
  useQueryClient,
  type PlaceholderDataFunction,
} from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { BUILDINGS_QUERY_KEY } from "./use-buildings";
import { DASHBOARD_QUERY_KEY } from "./use-dashboard";

// ── Query Keys ──────────────────────────────────────────────────────────────

export const SENSORS_QUERY_KEY = ["sensors"] as const;
const SENSOR_PAGE_SIZE = 100;

// ── Types ───────────────────────────────────────────────────────────────────

export type SensorType = "internal_temp" | "external_temp" | "energy_meter" | "gas_meter";
export type SensorStatus = "active" | "inactive" | "maintenance" | "error";

export interface SensorWithBuilding {
  id: string;
  buildingId: string;
  sensorType: SensorType;
  location: string;
  serialNumber?: string;
  installationDate: string;
  status: SensorStatus;
  isOffline?: boolean;
  lastReading?: {
    value: number;
    timestamp: string;
    unit: string;
  };
  transmissionInterval: number;
  minThreshold?: number;
  maxThreshold?: number;
  building?: {
    id: string;
    name: string;
    address: string;
  };
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SensorReading {
  id?: string;
  timestamp: string;
  value: number;
  unit: string;
  metadata?: {
    sensorId: string;
    buildingId: string;
    sensorType: SensorType;
  };
}

export interface ListSensorsParams {
  buildingId?: string;
  sensorType?: SensorType;
  status?: SensorStatus;
  sortBy?: "createdAt" | "updatedAt" | "sensorType" | "status";
  sortOrder?: "asc" | "desc";
  limit?: string;
  offset?: string;
}

export interface UseSensorsOptions {
  refetchInterval?: number | false;
  placeholderData?: PlaceholderDataFunction<SensorListData> | SensorListData;
}

interface SensorListData {
  sensors: SensorWithBuilding[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface SensorReadingsParams {
  startDate?: string;
  endDate?: string;
  sortOrder?: "asc" | "desc";
  limit?: string;
  offset?: string;
}

// ── Queries ─────────────────────────────────────────────────────────────────

async function fetchSensorPage(params?: ListSensorsParams): Promise<SensorListData> {
  const res = await client.api.sensors.$get({
    query: {
      ...(params?.buildingId ? { buildingId: params.buildingId } : {}),
      ...(params?.sensorType ? { sensorType: params.sensorType } : {}),
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

  return (await res.json()) as SensorListData;
}

/**
 * Fetch all sensors with optional filters.
 * GET /api/sensors
 */
export function useSensors(params?: ListSensorsParams, options?: UseSensorsOptions) {
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
export function useAllSensors(params?: ListSensorsParams, options?: UseSensorsOptions) {
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
      const res = await client.api.sensors[":id"].$get({
        param: { id: id! },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(errorMessage(data));
      }

      const data = await res.json();
      return data;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

/**
 * Fetch readings for a sensor.
 * GET /api/sensors/:id/readings
 */
export function useSensorReadings(id: string | undefined, params?: SensorReadingsParams) {
  return useQuery({
    queryKey: [...SENSORS_QUERY_KEY, "readings", id, params ?? {}],
    queryFn: async () => {
      const res = await client.api.sensors[":id"].readings.$get({
        param: { id: id! },
        query: {
          ...(params?.startDate ? { startDate: params.startDate } : {}),
          ...(params?.endDate ? { endDate: params.endDate } : {}),
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
      return data;
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
    mutationFn: async (input: {
      buildingId: string;
      sensorType: SensorType;
      location: string;
      serialNumber?: string;
      installationDate?: string;
      transmissionInterval?: number;
      minThreshold?: number;
      maxThreshold?: number;
    }) => {
      const res = await client.api.sensors.$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(errorMessage(data));
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
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
    mutationFn: async (input: {
      id: string;
      sensorType?: SensorType;
      location?: string;
      serialNumber?: string;
      status?: SensorStatus;
      transmissionInterval?: number;
      minThreshold?: number | null;
      maxThreshold?: number | null;
    }) => {
      const { id, ...body } = input;
      const res = await client.api.sensors[":id"].$patch({
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
      queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
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
      const res = await client.api.sensors[":id"].$delete({
        param: { id },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(errorMessage(data));
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
    },
  });
}
