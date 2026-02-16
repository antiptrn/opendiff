import { SiGithub } from "@icons-pack/react-simple-icons";
import { Button } from "components/components/ui/button";
import { cn } from "components/utils";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/use-auth";

type LoginProvider = "github" | "google" | "microsoft" | null;

// Global flag to track if the Turnstile script has been injected
let turnstileScriptInjected = false;

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          size?: "normal" | "compact" | "invisible";
          appearance?: "always" | "interaction-only" | "execute";
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      execute: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface LoginFormProps extends React.ComponentProps<"form"> {
  addAccount?: boolean;
  redirectUrl?: string | null;
}

/** Renders login buttons for GitHub, Google, and Microsoft authentication providers. */
export function LoginForm({ className, addAccount, redirectUrl, ...props }: LoginFormProps) {
  const { login, loginWithGoogle, loginWithMicrosoft, setAddingAccount } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const pendingProviderRef = useRef<LoginProvider>(null);
  const eventListenerRef = useRef<{ script: HTMLScriptElement; listener: () => void } | null>(null);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const hasTurnstile = !!turnstileSiteKey?.trim();

  const startProviderLogin = useCallback(
    (provider: Exclude<LoginProvider, null>, turnstileToken?: string) => {
      if (addAccount) {
        setAddingAccount();
      }

      if (provider === "github") {
        login(redirectUrl || undefined, turnstileToken);
        return;
      }

      if (provider === "google") {
        loginWithGoogle(redirectUrl || undefined, turnstileToken);
        return;
      }

      loginWithMicrosoft(redirectUrl || undefined, turnstileToken);
    },
    [addAccount, login, loginWithGoogle, loginWithMicrosoft, redirectUrl, setAddingAccount]
  );

  useEffect(() => {
    const siteKey = turnstileSiteKey?.trim();

    if (!siteKey || !turnstileContainerRef.current) {
      return;
    }

    const renderWidget = () => {
      if (!window.turnstile || !turnstileContainerRef.current || turnstileWidgetIdRef.current) {
        return;
      }

      turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: siteKey,
        size: "invisible",
        appearance: "execute",
        theme: "dark",
        callback: (token: string) => {
          const provider = pendingProviderRef.current;
          pendingProviderRef.current = null;

          if (!provider) {
            return;
          }

          setTurnstileError(null);
          startProviderLogin(provider, token);
        },
        "error-callback": () => {
          pendingProviderRef.current = null;
          setLoadingProvider(null);
          setTurnstileError("Verification failed. Please try again.");
        },
        "expired-callback": () => {
          pendingProviderRef.current = null;
          setLoadingProvider(null);
          setTurnstileError("Verification expired. Please try signing in again.");
        },
      });
    };

    // Only inject the script once across all component instances
    if (!turnstileScriptInjected) {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]'
      );

      if (existingScript) {
        if (window.turnstile) {
          renderWidget();
        } else {
          const handleLoad = () => renderWidget();
          existingScript.addEventListener("load", handleLoad);
          eventListenerRef.current = { script: existingScript, listener: handleLoad };
        }
      } else {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        const handleLoad = () => renderWidget();
        script.addEventListener("load", handleLoad);
        eventListenerRef.current = { script, listener: handleLoad };
        document.head.appendChild(script);
      }

      turnstileScriptInjected = true;
    } else if (window.turnstile) {
      // Script already injected and loaded, just render the widget
      renderWidget();
    }

    return () => {
      // Clean up event listener if it exists
      if (eventListenerRef.current) {
        eventListenerRef.current.script.removeEventListener(
          "load",
          eventListenerRef.current.listener
        );
        eventListenerRef.current = null;
      }

      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }

      pendingProviderRef.current = null;
    };
  }, [startProviderLogin]);

  const handleProviderLogin = (provider: Exclude<LoginProvider, null>) => {
    setLoadingProvider(provider);
    setTurnstileError(null);

    // Check if Turnstile is configured via environment variable
    if (!hasTurnstile) {
      if (import.meta.env.DEV) {
        console.warn(
          "VITE_TURNSTILE_SITE_KEY is not configured. Proceeding with login without human verification."
        );
      }
      startProviderLogin(provider);
      return;
    }

    if (!window.turnstile || !turnstileWidgetIdRef.current) {
      setLoadingProvider(null);
      setTurnstileError("Human verification is loading. Please try again.");
      return;
    }

    pendingProviderRef.current = provider;

    try {
      window.turnstile.execute(turnstileWidgetIdRef.current);
    } catch {
      pendingProviderRef.current = null;
      setLoadingProvider(null);
      setTurnstileError("Unable to start verification. Please refresh and try again.");
    }
  };

  const isLoading = loadingProvider !== null;

  return (
    <form
      className={cn("flex flex-col items-center gap-3 w-full max-w-sm mx-auto", className)}
      {...props}
    >
      <Button
        size="lg"
        variant="secondary"
        type="button"
        className="w-full"
        onClick={() => handleProviderLogin("github")}
        disabled={isLoading}
      >
        {loadingProvider === "github" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <SiGithub className="size-4" />
        )}
        {addAccount ? "Add GitHub account" : "Login with GitHub"}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        type="button"
        className="w-full"
        onClick={() => handleProviderLogin("google")}
        disabled={isLoading}
      >
        {loadingProvider === "google" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <img src="/icons/google-icon.svg" alt="" className="size-4" />
        )}
        {addAccount ? "Add Google account" : "Login with Google"}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        type="button"
        className="w-full"
        onClick={() => handleProviderLogin("microsoft")}
        disabled={isLoading}
      >
        {loadingProvider === "microsoft" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <img src="/icons/microsoft-icon.svg" alt="" className="size-4" />
        )}
        {addAccount ? "Add Microsoft account" : "Login with Microsoft"}
      </Button>
      {hasTurnstile && (
        <>
          <div ref={turnstileContainerRef} className="h-0 w-0 overflow-hidden" aria-hidden="true" />
          {turnstileError && <p className="text-sm text-destructive -mt-1">{turnstileError}</p>}
        </>
      )}
    </form>
  );
}
