import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { client } from "@/lib/api";
import { UserSchema } from "@wattguard/shared";
import { z } from "zod";

/** 
 * Safely extract an error message from an RPC response body.
 */
function extractError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as Record<string, unknown>).error;
    return typeof err === "string" ? err : fallback;
  }
  return fallback;
}

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
      const res = await client.api.auth.me.$get();

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
      const res = await client.api.invites.validate.$get({
        query: { token: token! },
      });

      const data = await res.json();

      if (!res.ok || 'error' in data) {
        throw new Error(extractError(data, "Invalid invite"));
      }

      return data;
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
      const res = await client.api.auth.local["validate-reset-token"].$get({
        query: { token: token! },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(extractError(data, "Invalid token"));
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
      const res = await client.api.auth.local.login.$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(extractError(data, "Login failed"));
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
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
      const res = await client.api.auth.logout.$post();

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
      navigate("/login");
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
      const res = await client.api.auth.local.setup.$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(extractError(data, "Setup failed"));
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
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
      const res = await client.api.auth.local["forgot-password"].$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(extractError(data, "Request failed"));
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
      const res = await client.api.auth.local["reset-password"].$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(extractError(data, "Reset failed"));
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
      const res = await client.api.admin.users.$get();

      if (!res.ok) {
        const data = await res.json();
        throw new Error(extractError(data, "Failed to fetch users"));
      }

      const data = await res.json();
      return data.users;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Update a user's role via PATCH /api/admin/users/:id/role (admin only).
 * On success, invalidates the users query to refresh the list.
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; role: "admin" | "operator" }) => {
      const res = await client.api.admin.users[":id"].role.$patch({
        param: { id: input.id },
        json: { role: input.role },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(extractError(data, "Failed to update user role"));
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
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
      const res = await client.api.admin.users[":id"].$delete({
        param: { id },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(extractError(data, "Failed to delete user"));
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
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
      const res = await client.api.admin.invites.$post({
        json: input,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(extractError(data, "Failed to create invite"));
      }

      return data;
    },
  });
}
