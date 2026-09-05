import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import type { Invite, ListInvitesResponse } from "@wattguard/shared";

export type { Invite, ListInvitesResponse };

export const INVITES_QUERY_KEY = ["admin", "invites"] as const;

/**
 * Fetch all invites via GET /api/v1/invites (admin only).
 */
export function useInvites() {
  return useQuery({
    queryKey: INVITES_QUERY_KEY,
    queryFn: async (): Promise<Invite[]> => {
      const res = await client.api.v1.invites.$get();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const data = await res.json();
      return data.data;
    }
  });
}

/**
 * Revoke a pending invite via DELETE /api/v1/invites/:id (admin only).
 * On success, invalidates the invites query to refresh the list.
 */
export function useRevokeInvite() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.invites[":id"].$delete({
        param: { id },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
    onSuccess: (data) => {
      toast.success(t("invites.revoked", { email: data.email }));
      void queryClient.invalidateQueries({ queryKey: INVITES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(t("errors.prefix", { message: error.message }));
    },
  });
}
