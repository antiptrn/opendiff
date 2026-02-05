import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useNavigationConfig } from "../../navigation";
import { useAuth } from "../hooks/use-auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const { afterAuthUrl } = useNavigationConfig();
  const queryClient = useQueryClient();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const handleAuth = async () => {
      const userParam = searchParams.get("user");
      const error = searchParams.get("error");
      const redirectUrl = searchParams.get("redirectUrl");

      if (error) {
        navigate(`/login?error=${error}`);
        return;
      }

      if (userParam) {
        try {
          const userData = JSON.parse(decodeURIComponent(userParam));

          // Prefetch organization data before navigating to console
          // This eliminates the loading spinner in the org switcher
          const userId = userData.visitorId || userData.id;
          try {
            const response = await fetch(`${API_URL}/api/organizations`, {
              headers: { Authorization: `Bearer ${userData.access_token}` },
            });
            if (response.ok) {
              const orgData = await response.json();
              queryClient.setQueryData(["organizations", userId], orgData);
            }
          } catch {
            // Org prefetch failed, not critical - will load in console
          }

          setUser(userData);
          navigate(redirectUrl || afterAuthUrl);
        } catch {
          navigate("/login?error=invalid_user_data");
        }
      } else {
        navigate("/login?error=no_user_data");
      }
    };

    handleAuth();
  }, [searchParams, navigate, setUser, queryClient, afterAuthUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}
