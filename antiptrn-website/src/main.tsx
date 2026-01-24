import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { OrganizationProvider } from "./contexts/organization-context"

import "./index.css"
import App from "./App.tsx"
import { HomePage } from "./pages/home.tsx"
import { ServicesPage } from "./pages/services.tsx"
import LoginPage from "./pages/login.tsx"
import { AuthCallbackPage } from "./pages/auth-callback.tsx"
import { ConsoleLayout } from "./components/console/console-layout.tsx"
import { ConsolePage } from "./pages/console.tsx"
import { SettingsPage } from "./pages/settings"
import { ReviewsPage } from "./pages/reviews.tsx"
import { AdminPage } from "./pages/admin.tsx"
import { PricingPage } from "./pages/pricing.tsx"
import { SubscriptionSuccessPage } from "./pages/subscription-success.tsx"
import CreateOrganizationPage from "./pages/create-organization.tsx"
import InvitePage from "./pages/invite.tsx"
import OnboardingPage from "./pages/onboarding.tsx"

const queryClient = new QueryClient()

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
      { path: "reviews", element: <ReviewsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "admin", element: <AdminPage /> },
      { path: "organization", element: <Navigate to="/console/settings?tab=organization" replace /> },
      { path: "billing", element: <Navigate to="/console/settings?tab=billing" replace /> },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <OrganizationProvider>
        <RouterProvider router={router} />
      </OrganizationProvider>
    </QueryClientProvider>
  </StrictMode>
)
