import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import App from "./App.tsx";
import { ConsoleLayout } from "@shared/components/layout/console";

// Features
import { LoginPage, AuthCallbackPage, OnboardingPage, useAuth } from "@features/auth";
import { ConsolePage } from "@features/dashboard";
import { PricingPage, SubscriptionSuccessPage } from "@features/billing";
import { SettingsPage } from "@features/settings";
import { RepositoriesPage } from "@features/reviews";
import { AdminPage } from "@features/admin";
import { HomePage, ServicesPage } from "@features/marketing";

// Modules
import {
  OrganizationProvider,
  CreateOrganizationPage,
  InvitePage,
} from "@modules/organizations";

// Get active account ID from localStorage (avoids React state timing issues)
function getActiveAccountId(): string {
  try {
    const stored = localStorage.getItem("antiptrn_accounts");
    if (stored) {
      const data = JSON.parse(stored);
      return data.activeAccountId || "anonymous";
    }
  } catch {
    // ignore
  }
  return "anonymous";
}

// Wrapper that keys OrganizationProvider by user ID so it remounts on account switch
function KeyedOrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Use localStorage value for initial render stability, fall back to user from state
  const userId = user?.visitorId ?? user?.id ?? getActiveAccountId();
  return <OrganizationProvider key={userId}>{children}</OrganizationProvider>;
}

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "services", element: <ServicesPage /> },
      { path: "pricing", element: <PricingPage /> },
      { path: "subscription/success", element: <SubscriptionSuccessPage /> },
    ],
  },
  // Standalone pages without header/footer
  { path: "/login", element: <LoginPage /> },
  { path: "/auth/callback", element: <AuthCallbackPage /> },
  { path: "/onboarding", element: <OnboardingPage /> },
  { path: "/create-organization", element: <CreateOrganizationPage /> },
  { path: "/invite/:token", element: <InvitePage /> },
  {
    path: "/console",
    element: <ConsoleLayout />,
    children: [
      { index: true, element: <ConsolePage /> },
      { path: "repositories", element: <RepositoriesPage /> },
      { path: "reviews", element: <Navigate to="/console/repositories" replace /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settings/:tab", element: <SettingsPage /> },
      { path: "admin", element: <AdminPage /> },
      // Legacy redirects
      { path: "organization", element: <Navigate to="/console/settings/organization" replace /> },
      { path: "billing", element: <Navigate to="/console/settings/billing" replace /> },
    ],
  },
]);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <KeyedOrganizationProvider>
        <RouterProvider router={router} />
      </KeyedOrganizationProvider>
    </QueryClientProvider>
  </StrictMode>
);
