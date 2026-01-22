import { useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2, ArrowLeft } from "lucide-react";

export default function CreateOrganizationPage() {
  const navigate = useNavigate();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { createOrg, isCreating, hasOrganizations, isLoadingOrgs } = useOrganization();

  const [name, setName] = useState("");
  const [error, setError] = useState("");

  // Show loading while checking auth or orgs
  if (isAuthLoading || isLoadingOrgs) {
    return (
      <section className="w-screen h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }

    try {
      await createOrg(name.trim());
      // Navigate to console - the query will be invalidated and refetched
      navigate("/console");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    }
  };

  return (
    <section className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {hasOrganizations && (
          <div className="p-4 pb-0">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/console">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to console
              </Link>
            </Button>
          </div>
        )}
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            {hasOrganizations ? "Create another organization" : "Create your organization"}
          </CardTitle>
          <CardDescription>
            Organizations help you manage your team and billing in one place.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input
                id="name"
                placeholder="Acme Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isCreating}
                autoFocus
              />
              <p className="text-sm text-muted-foreground">
                You can always change this later.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full" disabled={isCreating || !name.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create organization"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </section>
  );
}
