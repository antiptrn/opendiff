import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import "./index.css"
import App from "./App.tsx"
import { HomePage } from "./pages/home.tsx"
import { ServicesPage } from "./pages/services.tsx"
import LoginPage from "./pages/login.tsx"
import { AuthCallbackPage } from "./pages/auth-callback.tsx"
import { ConsoleLayout } from "./components/console/console-layout.tsx"
import { ConsolePage } from "./pages/console.tsx"
import { SettingsPage } from "./pages/settings.tsx"
import { BillingPage } from "./pages/billing.tsx"
import { PricingPage } from "./pages/pricing.tsx"
import { SubscriptionSuccessPage } from "./pages/subscription-success.tsx"

const queryClient = new QueryClient()

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "services", element: <ServicesPage /> },
      { path: "pricing", element: <PricingPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "auth/callback", element: <AuthCallbackPage /> },
      { path: "subscription/success", element: <SubscriptionSuccessPage /> },
    ],
  },
  {
    path: "/console",
    element: <ConsoleLayout />,
    children: [
      { index: true, element: <ConsolePage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "billing", element: <BillingPage /> },
    ],
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
)
