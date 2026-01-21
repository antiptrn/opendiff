import { Button } from "@/components/ui/button";
import {
    Field,
    FieldGroup
} from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { SiGithub } from '@icons-pack/react-simple-icons';
import { useAuth } from "@/contexts/auth-context";

export function LoginForm({
    className,
    ...props
}: React.ComponentProps<"form">) {
    const { login } = useAuth();

    const handleGitHubLogin = () => {
        login();
    };

    return (
        <form className={cn("flex flex-col gap-6 max-w-sm mx-auto", className)} {...props}>
            <FieldGroup>
                <Field>
                    <Button size="lg" variant="outline" type="button" onClick={handleGitHubLogin}>
                        <SiGithub className="size-4" />
                        Login with GitHub
                    </Button>
                </Field>
            </FieldGroup>
        </form>
    )
}
