import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import "./index.css";
import { ConsoleLayout } from "@/components/layout/console";

import { AdminPage } from "@/features/admin";
import { CheckoutPage } from "@/features/billing/pages/checkout";
import { SubscriptionSuccessPage } from "@/features/billing/pages/subscription-success";
// Features (app-local)
import { ConsolePage } from "@/features/dashboard";
import {
  RepositoriesPage,
  PullRequestDetailPage,
  PullRequestsListPage,
} from "@/features/pull-requests";
import { SettingsPage } from "@/features/settings";

// Shared (from opendiff-shared)
import { AuthCallbackPage, LoginPage, OnboardingPage } from "opendiff-shared/auth";
import {
  CreateOrganizationPage,
  InvitePage,
  KeyedOrganizationProvider,
} from "opendiff-shared/organizations";
import { Toaster } from "sonner";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  // Standalone pages without header/footer
  { path: "/login", element: <LoginPage /> },
  { path: "/auth/callback", element: <AuthCallbackPage /> },
  { path: "/onboarding", element: <OnboardingPage /> },
  { path: "/create-organization", element: <CreateOrganizationPage /> },
  { path: "/invite/:token", element: <InvitePage /> },
  { path: "/checkout", element: <CheckoutPage /> },
  { path: "/subscription/success", element: <SubscriptionSuccessPage /> },
  {
    path: "/console",
    element: <ConsoleLayout />,
    children: [
      { index: true, element: <ConsolePage /> },
      { path: "repositories", element: <RepositoriesPage /> },
      { path: "pull-requests", element: <PullRequestsListPage /> },
      { path: "pull-requests/:id", element: <PullRequestDetailPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settings/:tab", element: <SettingsPage /> },
      { path: "admin", element: <AdminPage /> },
      // Legacy redirects
      { path: "organization", element: <Navigate to="/console/settings/organization" replace /> },
      { path: "billing", element: <Navigate to="/console/settings/billing" replace /> },
    ],
  },
  // Catch-all redirect to console
  { path: "*", element: <Navigate to="/console" replace /> },
]);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <KeyedOrganizationProvider>
          <RouterProvider router={router} />
          <Toaster position="bottom-center" />
        </KeyedOrganizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
