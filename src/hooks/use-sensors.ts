import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { BUILDINGS_QUERY_KEY } from "./use-buildings";

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as Record<string, unknown>).error;
    return typeof err === "string" ? err : fallback;
  }
  return fallback;
}

// ── Query Keys ──────────────────────────────────────────────────────────────

export const SENSORS_QUERY_KEY = ["sensors"] as const;

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

export interface SensorReadingsParams {
  startDate?: string;
  endDate?: string;
  sortOrder?: "asc" | "desc";
  limit?: string;
  offset?: string;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Fetch all sensors with optional filters.
 * GET /api/sensors
 */
export function useSensors(params?: ListSensorsParams) {
  return useQuery({
    queryKey: [...SENSORS_QUERY_KEY, "list", params ?? {}],
    queryFn: async () => {
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
        throw new Error(extractError(data, "Errore nel caricamento dei sensori"));
      }

      const data = await res.json();
      return data;
    },
    staleTime: 60 * 1000,
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
        throw new Error(extractError(data, "Sensore non trovato"));
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
        throw new Error(extractError(data, "Errore nel caricamento delle letture"));
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
        throw new Error(extractError(data, "Errore nella creazione del sensore"));
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
        throw new Error(extractError(data, "Errore nell'aggiornamento del sensore"));
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
        throw new Error(extractError(data, "Errore nell'eliminazione del sensore"));
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SENSORS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BUILDINGS_QUERY_KEY });
    },
  });
}
