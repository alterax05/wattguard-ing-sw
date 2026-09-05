import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";

import type {
  BuildingType,
  CreateBuildingTypeRequest,
  UpdateBuildingTypeRequest,
  WithId,
} from "@wattguard/shared";

export const BUILDING_TYPES_QUERY_KEY = ["building-types"] as const;

/**
 * Fetch all building types.
 * GET /api/v1/building-types (admin + operator)
 */
export function useBuildingTypes() {
  return useQuery({
    queryKey: BUILDING_TYPES_QUERY_KEY,
    queryFn: async (): Promise<BuildingType[]> => {
      const res = await client.api.v1["building-types"].$get();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Create a new building type.
 * POST /api/v1/building-types (admin only)
 */
export function useCreateBuildingType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBuildingTypeRequest): Promise<BuildingType> => {
      const res = await client.api.v1["building-types"].$post({
        json:
          input.description === undefined
            ? { name: input.name }
            : { name: input.name, description: input.description },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BUILDING_TYPES_QUERY_KEY });
    },
  });
}

/**
 * Update a building type.
 * PATCH /api/v1/building-types/:id (admin only)
 */
export function useUpdateBuildingType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: WithId<UpdateBuildingTypeRequest>): Promise<BuildingType> => {
      const { id, ...body } = input;
      const res = await client.api.v1["building-types"][":id"].$patch({
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
      void queryClient.invalidateQueries({ queryKey: BUILDING_TYPES_QUERY_KEY });
    },
  });
}

/**
 * Delete a building type.
 * DELETE /api/v1/building-types/:id (admin only, fails when in use)
 */
export function useDeleteBuildingType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1["building-types"][":id"].$delete({
        param: { id },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BUILDING_TYPES_QUERY_KEY });
    },
  });
}
