import { useSearchParams, Navigate } from "react-router-dom";
import { LoginForm } from "@/components/auth/login-form";
import { useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
    const [searchParams] = useSearchParams();
    const error = searchParams.get("error");
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <section className="w-screen h-screen flex items-center justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </section>
        );
    }

    if (user) {
        return <Navigate to="/console" replace />;
    }

    return (
        <section className="pt-40 pb-32 px-4 sm:px-6 lg:px-8 max-w-[1200px] mx-auto">
            <div className="flex flex-col items-center justify-center">
                <h1 className="text-8xl mb-8">Login</h1>
                {error && (
                    <p className="text-red-500 mb-4">
                        Authentication error: {error.replace(/_/g, " ")}
                    </p>
                )}
            </div>
            <LoginForm />
        </section>
    );
}