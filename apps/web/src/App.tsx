import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute, GuestRoute } from "@/components/auth/protected-route";
import { DashboardLayout } from "./components/dashboard/dashboard-layout";
import { DashboardPage } from "./pages/DashboardPage";
import { MapPage } from "./pages/MapPage";
import { BuildingsPage } from "./pages/BuildingsPage";
import { BuildingsComparePage } from "./pages/BuildingsComparePage";
import { BuildingDetailPage } from "./pages/BuildingDetailPage";
import { AlertsPage } from "./pages/AlertsPage";
import { SensorsPage } from "./pages/SensorsPage";
import { UsersPage } from "./pages/UsersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";

export function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}

export default App;
