import { Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthContext } from "@/lib/auth";
import { useContext } from "react";

/**
 * Full-screen loading spinner shown while the auth state is being resolved.
 */
function AuthLoading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Route guard for authenticated routes.
 *
 * - While the `/me` query is loading, shows a spinner.
 * - If the user is not authenticated, redirects to `/login`.
 * - If authenticated, renders child routes via `<Outlet />`.
 */
export function ProtectedRoute() {
  const { user, isLoading } = useContext(AuthContext)!;

  if (isLoading) {
    return <AuthLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

/**
 * Route guard for guest-only routes (login, forgot-password, etc.).
 *
 * - While the `/me` query is loading, shows a spinner.
 * - If the user is already authenticated, redirects to `/dashboard`.
 * - If not authenticated, renders child routes via `<Outlet />`.
 */
export function GuestRoute() {
  const { user, isLoading } = useContext(AuthContext)!;

  if (isLoading) {
    return <AuthLoading />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
