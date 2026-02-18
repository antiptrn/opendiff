import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotFound } from "components/components";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, Outlet, RouterProvider, createBrowserRouter } from "react-router-dom";

import "./index.css";
import { ConsoleLayout } from "@/components/layout/console";

import { AdminPage } from "@/features/admin";
import { CheckoutPage } from "@/features/billing/pages/checkout";
import { SubscriptionSuccessPage } from "@/features/billing/pages/subscription-success";
// Features (app-local)
import { ConsolePage } from "@/features/dashboard";
import {
  PullRequestDetailPage,
  PullRequestsListPage,
  RepositoriesPage,
} from "@/features/pull-requests";
import { SettingsPage } from "@/features/settings";

// Shared
import { AuthCallbackPage, LoginPage, OnboardingPage } from "shared/auth";
import { NavigationScrollToTop } from "shared/navigation";
import {
  CreateOrganizationPage,
  InvitePage,
  KeyedOrganizationProvider,
} from "shared/organizations";
import { Toaster } from "sonner";

const queryClient = new QueryClient();

function AppRouteShell() {
  return (
    <>
      <NavigationScrollToTop />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppRouteShell />,
    children: [
      // Standalone pages without header/footer
      { path: "login", element: <LoginPage /> },
      { path: "auth/callback", element: <AuthCallbackPage /> },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "create-organization", element: <CreateOrganizationPage /> },
      { path: "invite/:token", element: <InvitePage /> },
      { path: "checkout", element: <CheckoutPage /> },
      { path: "subscription/success", element: <SubscriptionSuccessPage /> },
      {
        path: "console",
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
          {
            path: "organization",
            element: <Navigate to="/console/settings/organization" replace />,
          },
          { path: "billing", element: <Navigate to="/console/settings/billing" replace /> },
        ],
      },
      { index: true, element: <Navigate to="/console" replace /> },
      { path: "*", element: <NotFound /> },
    ],
  },
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
