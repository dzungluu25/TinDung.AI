import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AgentsPage } from "./pages/AgentsPage";
import { MetricsPage } from "./pages/MetricsPage";
import { RolesPage } from "./pages/RolesPage";
import { LoanFormPage } from "./pages/LoanFormPage";
import { WorkflowBuilderPage } from "./pages/WorkflowBuilderPage";
import { SettingsPage } from "./pages/SettingsPage";

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route index element={<LandingPage />} />
      <Route element={<AppShell />}>
        <Route path="workspace" element={<DashboardPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="builder" element={<WorkflowBuilderPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="metrics" element={<MetricsPage />} />
        <Route path="loan-form" element={<LoanFormPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);
