import { createContext } from "react";
import { useCurrentUser, type AuthUser } from "@/hooks/use-auth";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextValue>({user: null, isLoading: false, isAuthenticated: false});

/**
 * Wraps the application and provides auth state via React context.
 *
 * Under the hood this uses TanStack Query's `useCurrentUser()` hook, which
 * means the user data is cached and deduplicated automatically -- multiple
 * components calling `useAuth()` won't trigger extra network requests.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();

  const value: AuthContextValue = {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
