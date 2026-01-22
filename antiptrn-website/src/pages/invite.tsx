import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2, CheckCircle2, XCircle } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface InviteDetails {
  organizationName: string;
  organizationSlug: string;
  organizationAvatar: string | null;
  role: string;
  invitedBy: string;
  expiresAt: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, isLoading: isAuthLoading, login } = useAuth();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Fetch invite details
  useEffect(() => {
    async function fetchInvite() {
      if (!token) return;

      try {
        const response = await fetch(`${API_URL}/api/organizations/invites/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Invalid invite");
          return;
        }

        setInvite(data);
      } catch {
        setError("Failed to load invite");
      } finally {
        setIsLoading(false);
      }
    }

    fetchInvite();
  }, [token]);

  // Accept invite
  const handleAccept = async () => {
    if (!token || !user?.access_token) return;

    setIsAccepting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/organizations/invites/${token}/accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to accept invite");
        return;
      }

      setAccepted(true);

      // Redirect to console after a short delay
      setTimeout(() => {
        // Force full page reload to get updated organizations
        window.location.href = "/console";
      }, 2000);
    } catch {
      setError("Failed to accept invite");
    } finally {
      setIsAccepting(false);
    }
  };

  // Loading state
  if (isLoading || isAuthLoading) {
    return (
      <section className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  // Error state
  if (error && !invite) {
    return (
      <section className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Invalid Invite</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild variant="outline">
              <Link to="/">Go to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </section>
    );
  }

  // Success state
  if (accepted) {
    return (
      <section className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Welcome!</CardTitle>
            <CardDescription>
              You've joined {invite?.organizationName}. Redirecting to dashboard...
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </section>
    );
  }

  // Invite details
  return (
    <section className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">You're invited!</CardTitle>
          <CardDescription>
            {invite?.invitedBy} has invited you to join{" "}
            <span className="font-semibold">{invite?.organizationName}</span> as a{" "}
            <span className="lowercase">{invite?.role}</span>.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <p className="text-sm text-destructive mb-4 text-center">{error}</p>
          )}

          {!user ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Please sign in with GitHub to accept this invite.
              </p>
              <Button onClick={login} className="w-full">
                Sign in with GitHub
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="w-10 h-10 rounded-full"
                  />
                  <div>
                    <p className="font-medium">{user.name || user.login}</p>
                    <p className="text-sm text-muted-foreground">@{user.login}</p>
                  </div>
                </div>
              </div>

              <Button onClick={handleAccept} className="w-full" disabled={isAccepting}>
                {isAccepting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  "Accept Invite"
                )}
              </Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-xs text-muted-foreground">
            This invite expires on{" "}
            {invite?.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : "soon"}
          </p>
        </CardFooter>
      </Card>
    </section>
  );
}
