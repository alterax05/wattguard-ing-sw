import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";
import { UserSchema } from "@wattguard/shared";
import { z } from "zod";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: "admin" | "operator";
  isDisabled?: boolean;
  lastLoginAt?: string;
}

/**
 * Fetch the current authenticated user via GET /api/auth/me.
 *
 * - On 401 (not authenticated) the query resolves to `null` instead of erroring,
 *   so components can simply check `data === null` for the guest state.
 * - `retry: false` avoids hammering the server when the user is simply not
 *   logged in.
 * - `staleTime: 5 min` avoids refetching on every route change.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async (): Promise<AuthUser | null> => {
      const res = await client.api.v1.auth.me.$get();

      if (res.status === 401) {
        return null;
      }

      if (!res.ok) {
        throw new Error("Failed to fetch user");
      }

      const data = await res.json();
      return {
        ...data.user,
        name: data.user.name ?? undefined,
        lastLoginAt: data.user.lastLoginAt ?? undefined,
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Validate an invite token via GET /api/invites/validate?token=...
 */
export function useValidateInvite(token: string | null) {
  return useQuery({
    queryKey: ["invites", "validate", token],
    queryFn: async () => {
      const res = await client.api.v1.invites.validate.$get({
        query: { token: token! },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return res.json();
    },
    enabled: !!token,
    retry: false,
  });
}

/**
 * Validate a password reset token via GET /api/auth/local/validate-reset-token?token=...
 */
export function useValidateResetToken(token: string | null) {
  return useQuery({
    queryKey: ["auth", "validate-reset-token", token],
    queryFn: async () => {
      const res = await client.api.v1.auth.local["validate-reset-token"].$get({
        query: { token: token! },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return data;
    },
    enabled: !!token,
    retry: false,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

/**
 * Login via POST /api/auth/local/login.
 * On success, invalidates the auth query so the app re-fetches /me.
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const res = await client.api.v1.auth.local.login.$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

/**
 * Logout via POST /api/auth/logout.
 * Clears the entire query cache so no stale authenticated data remains.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      const res = await client.api.v1.auth.logout.$post();

      if (!res.ok) {
        throw new Error("Logout failed");
      }

      return res.json();
    },
    onSuccess: () => {
      // Set the auth user to null first — this triggers AuthProvider to
      // re-render with `user: null`, which causes ProtectedRoute to redirect.
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      // Clear all other cached data so nothing stale remains.
      queryClient.clear();
      // Navigate as a safety net (ProtectedRoute will also redirect reactively).
      void navigate("/login");
    },
  });
}

/**
 * Setup (accept invite with password) via POST /api/auth/local/setup.
 * On success, invalidates the auth query so the app picks up the new session.
 */
export function useSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      inviteToken: string;
      password: string;
      name: string;
    }) => {
      const res = await client.api.v1.auth.local.setup.$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

/**
 * Forgot password via POST /api/auth/local/forgot-password.
 * Always resolves successfully (server never reveals whether the email exists).
 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (input: { email: string }) => {
      const res = await client.api.v1.auth.local["forgot-password"].$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return data;
    },
  });
}

/**
 * Reset password via POST /api/auth/local/reset-password.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: { token: string; password: string }) => {
      const res = await client.api.v1.auth.local["reset-password"].$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return data;
    },
  });
}


export const USERS_QUERY_KEY = ["admin", "users"] as const;

export type AdminUser = z.infer<typeof UserSchema>;

/**
 * Fetch all users via GET /api/admin/users (admin only).
 */
export function useUsers() {
  return useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: async (): Promise<AdminUser[]> => {
      const res = await client.api.v1.admin.users.$get();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const data = await res.json();
      return data.users;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Update a user's role or disabled status via PATCH /api/admin/users/:id (admin only).
 * On success, invalidates the users query to refresh the list.
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      role?: "admin" | "operator";
      isDisabled?: boolean;
    }) => {
      const res = await client.api.v1.admin.users[":id"].$patch({
        param: { id: input.id },
        json: {
          role: input.role,
          isDisabled: input.isDisabled,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

/**
 * Delete a user via DELETE /api/admin/users/:id (admin only).
 * On success, invalidates the users query to refresh the list.
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.admin.users[":id"].$delete({
        param: { id },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

/**
 * Create a new invite via POST /api/admin/invites (admin only).
 * Sends an invitation email to the specified address.
 */
export function useCreateInvite() {
  return useMutation({
    mutationFn: async (input: { email: string; role: "admin" | "operator" }) => {
      const res = await client.api.v1.admin.invites.$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      return data;
    },
  });
}
