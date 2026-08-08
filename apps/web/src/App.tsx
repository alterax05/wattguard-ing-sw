import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute, GuestRoute } from "@/components/auth/protected-route";
import { DashboardLayout } from "./components/dashboard/dashboard-layout";
import { Spinner } from "./components/ui/spinner";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const MapPage = lazy(() => import("./pages/MapPage"));
const BuildingsPage = lazy(() => import("./pages/BuildingsPage"));
const BuildingsComparePage = lazy(() => import("./pages/BuildingsComparePage"));
const BuildingDetailPage = lazy(() => import("./pages/BuildingDetailPage"));
const AlertsPage = lazy(() => import("./pages/AlertsPage"));
const SensorsPage = lazy(() => import("./pages/SensorsPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));

export function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center">
            <Spinner className="size-8" />
          </div>
        }
      >
        <Routes>
          {/* Guest-only routes (redirect to dashboard if already logged in) */}
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
          </Route>

          {/* Protected dashboard routes */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dashboard/map" element={<MapPage />} />
              <Route path="/dashboard/buildings" element={<BuildingsPage />} />
              <Route path="/dashboard/buildings/compare" element={<BuildingsComparePage />} />
              <Route path="/dashboard/buildings/:id" element={<BuildingDetailPage />} />
              <Route path="/dashboard/sensors" element={<SensorsPage />} />
              <Route path="/dashboard/alerts" element={<AlertsPage />} />
              <Route path="/dashboard/users" element={<UsersPage />} />
              <Route path="/dashboard/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
