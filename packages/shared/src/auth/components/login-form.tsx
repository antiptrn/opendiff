import { SiGithub } from "@icons-pack/react-simple-icons";
import { Button } from "components/components/ui/button";
import { cn } from "components/utils";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/use-auth";

type LoginProvider = "github" | "google" | "microsoft" | null;
type VerificationStatus = "loading" | "ready" | "error";
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_LOAD_ERROR = "Human verification failed to load. Please refresh and try again.";
const TURNSTILE_EXECUTE_ERROR = "Unable to start verification. Please refresh and try again.";

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
          execution?: "render" | "execute";
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      ready?: (callback: () => void) => void;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface LoginFormProps extends React.ComponentProps<"form"> {
  addAccount?: boolean;
  redirectUrl?: string | null;
  onVerificationStatusChange?: (status: VerificationStatus) => void;
}

/** Renders login buttons for GitHub, Google, and Microsoft authentication providers. */
export function LoginForm({
  className,
  addAccount,
  redirectUrl,
  onVerificationStatusChange,
  ...props
}: LoginFormProps) {
  const { login, loginWithGoogle, loginWithMicrosoft, setAddingAccount } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const hasTurnstile = !import.meta.env.DEV && !!turnstileSiteKey?.trim();
  const [verificationStatus, setVerificationStatusState] = useState<VerificationStatus>(
    hasTurnstile ? "loading" : "ready"
  );
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstileTokenRef = useRef<string | null>(null);
  const pendingProviderRef = useRef<LoginProvider>(null);
  const eventListenerRef = useRef<{ script: HTMLScriptElement; listener: () => void } | null>(null);
  const startProviderLoginRef = useRef<
    (provider: Exclude<LoginProvider, null>, turnstileToken?: string) => void
  >(() => {});

  const setVerificationStatus = useCallback(
    (status: VerificationStatus) => {
      setVerificationStatusState(status);
      onVerificationStatusChange?.(status);
    },
    [onVerificationStatusChange]
  );

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
    startProviderLoginRef.current = startProviderLogin;
  }, [startProviderLogin]);

  useEffect(() => {
    const siteKey = turnstileSiteKey?.trim();

    if (!hasTurnstile || !siteKey) {
      setVerificationStatus("ready");
      return;
    }

    setVerificationStatus("loading");

    if (!turnstileContainerRef.current) {
      return;
    }

    let isMounted = true;

    const markScriptStatus = (status: "loaded" | "error") => {
      const script = document.querySelector<HTMLScriptElement>(
        `script[src="${TURNSTILE_SCRIPT_SRC}"]`
      );
      if (script) {
        script.dataset.turnstileStatus = status;
      }
    };

    const renderWidget = () => {
      if (
        !isMounted ||
        !window.turnstile ||
        !turnstileContainerRef.current ||
        turnstileWidgetIdRef.current
      ) {
        return;
      }

      try {
        turnstileWidgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
          sitekey: siteKey,
          size: "invisible",
          appearance: "execute",
          execution: "execute",
          theme: "dark",
          callback: (token: string) => {
            const provider = pendingProviderRef.current;
            pendingProviderRef.current = null;
            setTurnstileError(null);

            if (!provider) {
              turnstileTokenRef.current = token;
              setVerificationStatus("ready");
              return;
            }

            startProviderLoginRef.current(provider, token);
          },
          "error-callback": () => {
            turnstileTokenRef.current = null;
            pendingProviderRef.current = null;
            setLoadingProvider(null);
            setVerificationStatus("error");
            setTurnstileError("Verification failed. Please try again.");
          },
          "expired-callback": () => {
            turnstileTokenRef.current = null;
            pendingProviderRef.current = null;
            setLoadingProvider(null);
            setTurnstileError(null);
            setVerificationStatus("loading");

            if (turnstileWidgetIdRef.current && window.turnstile) {
              try {
                window.turnstile.reset(turnstileWidgetIdRef.current);
                window.turnstile.execute(turnstileWidgetIdRef.current);
              } catch {
                setVerificationStatus("error");
                setTurnstileError(TURNSTILE_EXECUTE_ERROR);
              }
            }
          },
        });
        setTurnstileError(null);
      } catch {
        markScriptStatus("error");
        setVerificationStatus("error");
        setTurnstileError(TURNSTILE_LOAD_ERROR);
        return;
      }

      try {
        window.turnstile.execute(turnstileWidgetIdRef.current);
      } catch {
        setVerificationStatus("error");
        setTurnstileError(TURNSTILE_EXECUTE_ERROR);
      }
    };

    const renderWhenReady = () => {
      if (!window.turnstile) {
        return;
      }

      renderWidget();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`
    );
    const script = existingScript ?? document.createElement("script");
    const handleLoad = () => {
      script.dataset.turnstileStatus = "loaded";
      renderWhenReady();
    };
    const handleError = () => {
      if (!isMounted) {
        return;
      }

      script.dataset.turnstileStatus = "error";
      setVerificationStatus("error");
      setTurnstileError(TURNSTILE_LOAD_ERROR);
    };

    if (window.turnstile) {
      renderWhenReady();
    } else if (existingScript?.dataset.turnstileStatus === "error") {
      setVerificationStatus("error");
      setTurnstileError(TURNSTILE_LOAD_ERROR);
    } else {
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
      eventListenerRef.current = { script, listener: handleLoad };

      if (!existingScript) {
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      isMounted = false;

      if (eventListenerRef.current) {
        eventListenerRef.current.script.removeEventListener(
          "load",
          eventListenerRef.current.listener
        );
        eventListenerRef.current.script.removeEventListener("error", handleError);
        eventListenerRef.current = null;
      }

      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }

      turnstileTokenRef.current = null;
      pendingProviderRef.current = null;
    };
  }, [hasTurnstile, setVerificationStatus]);

  const handleProviderLogin = (provider: Exclude<LoginProvider, null>) => {
    setLoadingProvider(provider);
    setTurnstileError(null);

    // Check if Turnstile is configured via environment variable
    if (!hasTurnstile) {
      if (import.meta.env.DEV) {
        console.warn(
          "Turnstile is disabled in development. Proceeding without human verification."
        );
      }
      startProviderLogin(provider);
      return;
    }

    if (verificationStatus !== "ready" || !window.turnstile || !turnstileWidgetIdRef.current) {
      setLoadingProvider(null);
      setTurnstileError("Human verification is loading. Please try again.");
      return;
    }

    if (turnstileTokenRef.current) {
      const token = turnstileTokenRef.current;
      turnstileTokenRef.current = null;
      startProviderLogin(provider, token);
      return;
    }

    pendingProviderRef.current = provider;

    try {
      window.turnstile.execute(turnstileWidgetIdRef.current);
    } catch {
      pendingProviderRef.current = null;
      setLoadingProvider(null);
      setTurnstileError(TURNSTILE_EXECUTE_ERROR);
    }
  };

  const isLoading = loadingProvider !== null;
  const showVerificationGate = hasTurnstile && verificationStatus !== "ready";

  return (
    <form className={cn("grid w-full max-w-sm gap-3 mx-auto", className)} {...props}>
      {showVerificationGate ? (
        <div className="flex min-h-28 items-center justify-center text-center">
          {verificationStatus === "loading" ? (
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          ) : (
            <p className="text-sm text-destructive">{turnstileError || TURNSTILE_LOAD_ERROR}</p>
          )}
        </div>
      ) : (
        <>
          <Button
            size="lg"
            variant="secondary"
            type="button"
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
        </>
      )}
      {hasTurnstile && (
        <>
          <div ref={turnstileContainerRef} className="h-0 w-0 overflow-hidden" aria-hidden="true" />
          {!showVerificationGate && turnstileError && (
            <p className="text-sm text-destructive -mt-1">{turnstileError}</p>
          )}
        </>
      )}
    </form>
  );
}
