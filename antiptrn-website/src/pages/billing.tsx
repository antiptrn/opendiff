import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useBilling, useCancelSubscription, useResubscribe, useGetInvoice } from "@/hooks/use-api";

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getTierName(tier?: string | null): string {
  switch (tier) {
    case "BYOK":
      return "BYOK";
    case "CODE_REVIEW":
      return "Code Review";
    case "TRIAGE":
      return "Triage";
    default:
      return "Free";
  }
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export function BillingPage() {
  const { user, refreshSubscription } = useAuth();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: billing, isLoading } = useBilling(user?.access_token);
  const cancelSubscription = useCancelSubscription(user?.access_token);
  const resubscribe = useResubscribe(user?.access_token);
  const getInvoice = useGetInvoice(user?.access_token);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);

  const subscription = billing?.subscription;
  const orders = billing?.orders || [];

  const hasSubscription = subscription?.tier && subscription.tier !== "FREE";
  const cancelAtPeriodEnd = subscription?.cancelAtPeriodEnd;

  const handleCancelSubscription = async () => {
    setShowCancelDialog(false);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await cancelSubscription.mutateAsync();
      await refreshSubscription();
      setSuccessMessage("Subscription cancelled. You will have access until the end of your billing period.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to cancel subscription");
    }
  };

  const handleResubscribe = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await resubscribe.mutateAsync();
      await refreshSubscription();
      setSuccessMessage("Subscription reactivated!");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to reactivate subscription");
    }
  };

  const handleDownloadInvoice = async (orderId: string) => {
    setDownloadingInvoice(orderId);
    try {
      const result = await getInvoice.mutateAsync(orderId);
      if (result.invoiceUrl) {
        window.open(result.invoiceUrl, "_blank");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to get invoice");
    } finally {
      setDownloadingInvoice(null);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Billing</h1>

      <div className="max-w-2xl space-y-6">
        {successMessage && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-green-600 dark:text-green-400">
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {errorMessage}
          </div>
        )}

        {/* Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-medium">{getTierName(subscription?.tier)}</p>
                  {hasSubscription ? (
                    cancelAtPeriodEnd ? (
                      <p className="text-sm text-orange-600 dark:text-orange-400">
                        Cancels {formatDate(subscription?.expiresAt)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Renews {formatDate(subscription?.expiresAt)}
                      </p>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Upgrade to enable code reviews
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {hasSubscription ? (
                    cancelAtPeriodEnd ? (
                      <Button
                        onClick={handleResubscribe}
                        disabled={resubscribe.isPending}
                      >
                        {resubscribe.isPending ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Reactivating...
                          </>
                        ) : (
                          "Resubscribe"
                        )}
                      </Button>
                    ) : (
                      <>
                        <Link to="/pricing">
                          <Button variant="secondary">Change Plan</Button>
                        </Link>
                        <Button
                          variant="destructive"
                          onClick={() => setShowCancelDialog(true)}
                          disabled={cancelSubscription.isPending}
                        >
                          {cancelSubscription.isPending ? (
                            <>
                              <Loader2 className="size-4 animate-spin mr-2" />
                              Cancelling...
                            </>
                          ) : (
                            "Downgrade to Free"
                          )}
                        </Button>
                      </>
                    )
                  ) : (
                    <Link to="/pricing">
                      <Button>Upgrade</Button>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Details */}
        {(hasSubscription || isLoading) && (
          <Card>
            <CardHeader>
              <CardTitle>Subscription Details</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </dl>
              ) : subscription && hasSubscription ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      {subscription?.status === "ACTIVE" ? (
                        <span className="inline-flex items-center gap-1.5">
                          Active
                        </span>
                      ) : (
                        <span className="text-orange-600 dark:text-orange-400">
                          {subscription?.status}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd>{getTierName(subscription?.tier)}</dd>
                  </div>
                  {subscription?.expiresAt && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        {cancelAtPeriodEnd ? "Access Until" : "Next Billing Date"}
                      </dt>
                      <dd>{formatDate(subscription?.expiresAt)}</dd>
                    </div>
                  )}
                </dl>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Billing History */}
        <Card>
          <CardHeader>
            <CardTitle>Billing History</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-between items-center py-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No billing history yet
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Date</th>
                      <th className="pb-2 font-medium text-muted-foreground">Plan</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Amount</th>
                      <th className="pb-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="py-3">
                          <span className="inline-flex items-center gap-1.5">
                            {formatDate(order.createdAt)}
                          </span>
                        </td>
                        <td className="py-3">{order.productName}</td>
                        <td className="py-3 text-right">
                          {formatCurrency(order.amount, order.currency)}
                        </td>
                        <td className="py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownloadInvoice(order.id)}
                            disabled={downloadingInvoice === order.id}
                          >
                            {downloadingInvoice === order.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Download className="size-4" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cancel Dialog */}
        <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel your subscription? You will have access until the end of your current billing period.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-primary text-background hover:bg-primary/90">Keep Subscription</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelSubscription}
                variant="destructive"
              >
                Downgrade to Free
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
