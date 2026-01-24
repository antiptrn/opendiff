import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Download } from "lucide-react";
import { useBilling, useGetInvoice } from "@/hooks/use-api";
import type { useAuth } from "@/hooks/use-auth";
import { formatDate, formatCurrency } from "../utils";

interface BillingHistoryCardProps {
  user: ReturnType<typeof useAuth>["user"];
  orgId?: string | null;
  isSoloUser?: boolean;
}

/**
 * Card component for displaying billing history
 */
export function BillingHistoryCard({ user, orgId, isSoloUser }: BillingHistoryCardProps) {
  const { data: billing, isLoading } = useBilling(user?.access_token, orgId);
  const getInvoice = useGetInvoice(user?.access_token);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const orders = billing?.orders || [];

  const handleDownloadInvoice = async (orderId: string) => {
    setDownloadingInvoice(orderId);
    setErrorMessage(null);
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
    <Card>
      <CardHeader>
        <CardTitle>Billing History</CardTitle>
      </CardHeader>
      <CardContent>
        {errorMessage && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive mb-4">
            {errorMessage}
          </div>
        )}
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
          <p className="text-base text-muted-foreground text-center pb-4 mt-4">
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
                  <th className="pb-2 w-10" />
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
                    <td className="py-3">
                      {isSoloUser
                        ? order.productName
                            .replace(/^1\s*[×x]\s*/i, "")
                            .replace(/\(at\s+/i, "at ")
                            .replace(/\s*\/\s*(month|year)\)/, " / $1")
                        : order.productName}
                    </td>
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
  );
}
