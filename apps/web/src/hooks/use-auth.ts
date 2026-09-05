import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";
import i18n from "@/lib/i18n";
import {
  isSupportedLocale,
  type User,
  type LoginRequest,
  type SetupRequest,
  type ForgotPasswordRequest,
  type ResetPasswordRequest,
  type CreateInviteRequest,
  type UpdateUserRequest,
} from "@wattguard/shared";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

export type AuthUser = User;

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

      const resData = await res.json();
      const userData = resData.data;
      const user: AuthUser = {
        ...userData,
        name: userData.name ?? undefined,
        language: isSupportedLocale(userData.language) ? userData.language : undefined,
        lastLoginAt: userData.lastLoginAt ?? undefined,
      };

      // Server-side preference wins at session start so alert emails match
      // what the user sees in the UI.
      if (user.language && i18n.language !== user.language) {
        void i18n.changeLanguage(user.language);
      }

      return user;
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Validate an invite token via GET /api/v1/invites/:token
 */
export function useValidateInvite(token: string | null) {
  return useQuery({
    queryKey: ["invites", "validate", token],
    queryFn: async () => {
      const res = await client.api.v1.invites[":token"].$get({
        param: { token: token! },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
    enabled: !!token,
    retry: false,
  });
}


/**
 * Validate a password reset token via GET /api/v1/auth/local/reset-tokens/:token
 */
export function useValidateResetToken(token: string | null) {
  return useQuery({
    queryKey: ["auth", "validate-reset-token", token],
    queryFn: async () => {
      const res = await client.api.v1.auth.local["reset-tokens"][":token"].$get({
        param: { token: token! },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
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
    mutationFn: async (input: LoginRequest) => {
      const res = await client.api.v1.auth.local.login.$post({
        json: input,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}

/**
 * Logout via DELETE /api/v1/auth/session.
 * Clears the entire query cache so no stale authenticated data remains.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      const res = await client.api.v1.auth.session.$delete();

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
    mutationFn: async (input: SetupRequest) => {
      const res = await client.api.v1.auth.local.setup.$post({
        json: input,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
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
    mutationFn: async (input: ForgotPasswordRequest) => {
      const res = await client.api.v1.auth.local["forgot-password"].$post({
        json: input,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
  });
}

/**
 * Reset password via POST /api/auth/local/reset-password.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: ResetPasswordRequest) => {
      const res = await client.api.v1.auth.local["reset-password"].$post({
        json: input,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
  });
}


export const USERS_QUERY_KEY = ["admin", "users"] as const;

export type AdminUser = User;

/**
 * Fetch all users via GET /api/v1/users (admin only).
 */
export function useUsers() {
  return useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: async (): Promise<AdminUser[]> => {
      const res = await client.api.v1.users.$get();

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const data = await res.json();
      return data.data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Update a user's role or disabled status via PATCH /api/v1/users/:id (admin only).
 * On success, invalidates the users query to refresh the list.
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateUserRequest & { id: string }) => {
      const { id, ...body } = input;
      const res = await client.api.v1.users[":id"].$patch({
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
      void queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
    },
  });
}

/**
 * Delete a user via DELETE /api/v1/users/:id (admin only).
 * On success, invalidates the users query to refresh the list.
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.users[":id"].$delete({
        param: { id },
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
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
    mutationFn: async (input: CreateInviteRequest) => {
      const res = await client.api.v1.invites.$post({
        json: input,
      });

      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res));
      }

      const resData = await res.json();
      return resData.data;
    },
  });
}
