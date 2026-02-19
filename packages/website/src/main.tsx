import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotFound } from "components/components";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import "./index.css";
import App from "./app.tsx";

import { PricingPage } from "@/features/billing/pages/pricing";
import { BlogArticlePage, BlogPage } from "@/features/blog";
import { ChangelogPage } from "@/features/changelog";
import { ComparisonArticlePage, ComparisonsPage } from "@/features/comparisons";
import { PrivacyPolicyPage, TermsOfServicePage } from "@/features/legal";
// Features
import { HomePage } from "@/features/marketing";

// Shared
import { KeyedOrganizationProvider } from "shared/organizations";
import { Toaster } from "sonner";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "blog", element: <BlogPage /> },
      { path: "blog/:slug", element: <BlogArticlePage /> },
      { path: "comparisons", element: <ComparisonsPage /> },
      { path: "comparisons/:slug", element: <ComparisonArticlePage /> },
      { path: "changelog", element: <ChangelogPage /> },
      { path: "pricing", element: <PricingPage /> },
      { path: "privacy", element: <PrivacyPolicyPage /> },
      { path: "terms", element: <TermsOfServicePage /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" forcedTheme="dark">
        <KeyedOrganizationProvider>
          <RouterProvider router={router} />
          <Toaster position="bottom-center" />
        </KeyedOrganizationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
