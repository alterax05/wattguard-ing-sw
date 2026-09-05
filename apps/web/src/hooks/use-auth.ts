import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { client } from "@/lib/api";
import { errorMessageFromResponse } from "@/lib/errors";
import i18n from "@/lib/i18n";
import {
  isSupportedLocale,
  type User,
  type LocalSessionRequest,
  type GoogleSessionRequest,
  type AcceptInviteRequest,
  type CreateResetTokenRequest,
  type ApplyPasswordResetRequest,
  type UpdateSessionRequest,
  type CreateInviteRequest,
  type UpdateUserRequest,
} from "@wattguard/shared";

export const AUTH_QUERY_KEY = ["auth", "session"] as const;

export type AuthUser = User;

/**
 * Fetch the current authenticated user via GET /api/v1/auth/session.
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
      const res = await client.api.v1.auth.session.$get();

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
 * Validate a password reset token via GET /api/v1/auth/reset-tokens/:token
 */
export function useValidateResetToken(token: string | null) {
  return useQuery({
    queryKey: ["auth", "validate-reset-token", token],
    queryFn: async () => {
      const res = await client.api.v1.auth["reset-tokens"][":token"].$get({
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
 * Create a session via POST /api/v1/auth/session (local login).
 * On success, invalidates the auth query so the app re-fetches the session.
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LocalSessionRequest) => {
      const res = await client.api.v1.auth.session.$post({
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
 * Public Google OAuth configuration via GET /api/v1/auth/google/config
 */
export function useGoogleAuthConfig() {
  return useQuery({
    queryKey: ["auth", "google", "config"],
    queryFn: async () => {
      const res = await client.api.v1.auth.google.config.$get();
      if (!res.ok) return null;
      const resData = await res.json();
      return resData.data;
    },
    staleTime: Infinity,
  });
}

/**
 * Create a session via POST /api/v1/auth/session using Google Identity Services ID token.
 */
export function useGoogleLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: GoogleSessionRequest) => {
      const res = await client.api.v1.auth.session.$post({
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
 * Update session profile / preferences via PATCH /api/v1/auth/session.
 */
export function useUpdateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateSessionRequest) => {
      const res = await client.api.v1.auth.session.$patch({
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
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.clear();
      void navigate("/login");
    },
  });
}

/**
 * Accept invite via POST /api/v1/invites/:token/acceptance (local password or Google SSO).
 * On success, invalidates the auth query so the app picks up the new session.
 */
export function useSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ token, ...body }: { token: string } & AcceptInviteRequest) => {
      const res = await client.api.v1.invites[":token"].acceptance.$post({
        param: { token },
        json: body,
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
 * Request password reset token via POST /api/v1/auth/reset-tokens.
 * Always resolves successfully (server never reveals whether the email exists).
 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (input: CreateResetTokenRequest) => {
      const res = await client.api.v1.auth["reset-tokens"].$post({
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
 * Reset password via POST /api/v1/auth/password-resets.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: ApplyPasswordResetRequest) => {
      const res = await client.api.v1.auth["password-resets"].$post({
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
