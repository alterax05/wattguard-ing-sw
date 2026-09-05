import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import type { Alert, ListAlertsResponse } from "@wattguard/shared";

export type { Alert, ListAlertsResponse };

export function useAlerts(params?: { status?: string; buildingId?: string }) {
  return useQuery({
    queryKey: ["alerts", params],
    queryFn: async () => {
      const query: Record<string, string> = {};
      if (params?.status) query.status = params.status;
      if (params?.buildingId) query.buildingId = params.buildingId;

      const res = await client.api.v1.alerts.$get({ query });
      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }
      const data = await res.json();
      return data.data;
    },
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const res = await client.api.v1.alerts[":id"].$patch({
        param: { id: alertId },
        json: { status: "acknowledged" },
      });
      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }
      const resData = await res.json();
      return resData.data;
    },
    onSuccess: () => {
      toast.success(t("alerts.acknowledgedToast"));
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
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
      const res = await client.api.v1.alerts[":id"].$patch({
        param: { id: alertId },
        json: { status: "resolved" },
      });
      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }
      const resData = await res.json();
      return resData.data;
    },
    onSuccess: () => {
      toast.success(t("alerts.resolvedToast"));
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (error) => {
      toast.error(t("errors.prefix", { message: error.message }));
    },
  });
}

