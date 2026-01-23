import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
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
        setUser(userData);
        // Use redirectUrl if provided, otherwise go to console
        navigate(redirectUrl || "/console");
      } catch {
        navigate("/login?error=invalid_user_data");
      }
    } else {
      navigate("/login?error=no_user_data");
    }
  }, [searchParams, navigate, setUser]);

  return (
    <section className="pt-40 pb-32 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
      <div className="flex flex-col items-center justify-center">
        <p className="text-xl">Completing login...</p>
      </div>
    </section>
  );
}
