import { Download, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "components/components/ui/alert-dialog";
import { Button } from "components/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "components/components/ui/card";
import { Skeleton } from "components/components/ui/skeleton";
import { useAuth } from "shared/auth";
import {
  formatCurrency,
  formatDate,
  getTierName,
  useBilling,
  useCancelSubscription,
  useGetInvoice,
  useResubscribe,
} from "shared/billing";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export function BillingPage() {
  const { user, refreshSubscription } = useAuth();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

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

    try {
      await cancelSubscription.mutateAsync();
      await refreshSubscription();
      toast.success(
        "Subscription cancelled. You will have access until the end of your billing period."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel subscription");
    }
  };

  const handleResubscribe = async () => {
    try {
      await resubscribe.mutateAsync();
      await refreshSubscription();
      toast.success("Subscription reactivated!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reactivate subscription");
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
      toast.error(error instanceof Error ? error.message : "Failed to get invoice");
    } finally {
      setDownloadingInvoice(null);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6">Billing</h1>

      <div className="max-w-2xl space-y-6">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton muted className="h-7 w-32" />
                <Skeleton muted className="h-5 w-48" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-lg">{getTierName(subscription?.tier)}</p>
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
                    <p className="text-sm text-muted-foreground">Upgrade to enable code reviews</p>
                  )}
                </div>

                <div className="flex gap-2">
                  {hasSubscription ? (
                    cancelAtPeriodEnd ? (
                      <Button onClick={handleResubscribe} disabled={resubscribe.isPending}>
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
                    <Button asChild>
                      <Link to={`${import.meta.env.VITE_APP_URL}/pricing`}>Upgrade</Link>
                    </Button>
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
              <CardTitle>Subscription</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <Skeleton muted className="h-5 w-16" />
                    <Skeleton muted className="h-5 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton muted className="h-5 w-12" />
                    <Skeleton muted className="h-5 w-24" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton muted className="h-5 w-28" />
                    <Skeleton muted className="h-5 w-20" />
                  </div>
                </dl>
              ) : subscription && hasSubscription ? (
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      {subscription?.status === "ACTIVE" ? (
                        <span className="inline-flex items-center gap-1.5">Active</span>
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
                  <div key={i} className="flex justify-between items-center h-14">
                    <Skeleton muted className="h-5 w-24" />
                    <Skeleton muted className="h-5 w-32" />
                    <Skeleton muted className="h-5 w-16" />
                    <Skeleton muted className="h-8 w-8 rounded-md" />
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
                      <th className="pb-2 text-muted-foreground">Date</th>
                      <th className="pb-2 text-muted-foreground">Plan</th>
                      <th className="pb-2 text-muted-foreground text-right">Amount</th>
                      <th className="pb-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b last:border-0">
                        <td className="h-14">
                          <span className="inline-flex items-center gap-1.5">
                            {formatDate(order.createdAt)}
                          </span>
                        </td>
                        <td className="h-14">{order.productName}</td>
                        <td className="h-14 text-right">
                          {formatCurrency(order.amount, order.currency)}
                        </td>
                        <td className="h-14">
                          <Button
                            variant="outline"
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
                Are you sure you want to cancel your subscription? You will have access until the
                end of your current billing period.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-primary text-background hover:bg-primary/90">
                Keep Subscription
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleCancelSubscription} variant="destructive">
                Downgrade to Free
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
