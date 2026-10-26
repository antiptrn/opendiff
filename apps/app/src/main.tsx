import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotFound } from "components/components";
import { ThemeProvider } from "next-themes";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, Outlet, RouterProvider, createBrowserRouter } from "react-router-dom";

import "./index.css";
import { ConsoleLayout } from "@/components/layout/console";

import { AdminPage } from "@/features/admin";
import { CheckoutPage } from "@/features/billing/pages/checkout";
import { SubscriptionSuccessPage } from "@/features/billing/pages/subscription-success";
// Features (app-local)
import { ConnectAgentPage } from "@/features/agent";
import { ConsolePage } from "@/features/dashboard";
import { IssuesPage } from "@/features/issues";
import {
  PullRequestDetailPage,
  PullRequestsListPage,
  RepositoriesPage,
} from "@/features/pull-requests";
import { SettingsPage } from "@/features/settings";

// Shared
import { AuthCallbackPage, EmailLinkPage, LoginPage, OnboardingPage } from "shared/auth";
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
      { path: "login/email", element: <EmailLinkPage /> },
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
          { path: "pull-requests", element: <PullRequestsListPage /> },
          { path: "pull-requests/:id", element: <PullRequestDetailPage /> },
          { path: "issues", element: <IssuesPage /> },
          { path: "repositories", element: <RepositoriesPage /> },
          // Access tokens for connecting an AI agent to Contrast's MCP server
          { path: "api-keys", element: <ConnectAgentPage /> },
          { path: "install", element: <Navigate to="/console/api-keys" replace /> },
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

/** Signed-out pages always render light so they match the marketing site */
const SIGNED_OUT_PATH_PREFIXES = ["/login", "/auth/callback", "/invite/"];

function isSignedOutPath(pathname: string) {
  return SIGNED_OUT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function useForcedTheme() {
  const [pathname, setPathname] = useState(router.state.location.pathname);
  useEffect(() => router.subscribe((state) => setPathname(state.location.pathname)), []);
  return isSignedOutPath(pathname) ? "light" : undefined;
}

function App() {
  const forcedTheme = useForcedTheme();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={forcedTheme}>
      <KeyedOrganizationProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-center" />
      </KeyedOrganizationProvider>
    </ThemeProvider>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
