import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface Alert {
  id: string;
  buildingId: string;
  buildingName: string;
  sensorId?: string;
  type: string;
  thresholdType?: "min" | "max";
  severity: "low" | "medium" | "high" | "critical";
  sensorType?: string;
  location?: string;
  value?: number;
  unit?: string;
  limit?: number;
  status: "active" | "acknowledged" | "resolved";
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ListAlertsResponse {
  alerts: Alert[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export function useAlerts(params?: { status?: string; buildingId?: string }) {
  return useQuery({
    queryKey: ["alerts", params],
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params?.status) query.status = params.status;
      if (params?.buildingId) query.buildingId = params.buildingId;

      const res = await client.api.v1.alerts.$get({ query });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(errorMessage(data));
      }
      return await res.json() as ListAlertsResponse;
    },
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const res = await client.api.v1.alerts[":id"].acknowledge.$patch({
        param: { id: alertId }
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(errorMessage(error));
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t("alerts.acknowledgedToast"));
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (error) => {
      toast.error(t("errors.prefix", { message: error.message }));
    },
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const res = await client.api.v1.alerts[":id"].resolve.$patch({
        param: { id: alertId }
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(errorMessage(error));
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t("alerts.resolvedToast"));
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (error) => {
      toast.error(t("errors.prefix", { message: error.message }));
    },
  });
}
