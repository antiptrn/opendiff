import type { useAuth } from "@features/auth";
import { useBilling, useGetInvoice } from "@features/billing";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import { Skeleton } from "@shared/components/ui/skeleton";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatDate } from "../lib/utils";

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
                  <th className="pb-2 font-normal text-muted-foreground w-[20%]">Date</th>
                  <th className="pb-2 font-normal text-muted-foreground w-[50%]">Plan</th>
                  <th className="pb-2 font-normal text-muted-foreground w-[20%]">Amount</th>
                  <th className="pb-2 w-[10%]" />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b last:border-0">
                    <td className="h-14 text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        {formatDate(order.createdAt)}
                      </span>
                    </td>
                    <td className="h-14 text-sm">
                      {isSoloUser
                        ? order.productName
                          .replace(/^1\s*[×x]\s*/i, "")
                          .replace(/\(at\s+/i, "at ")
                          .replace(/\s*\/\s*(month|year)\)/, " / $1")
                        : order.productName}
                    </td>
                    <td className="h-14 text-sm">
                      {formatCurrency(order.amount, order.currency)}
                    </td>
                    <td className="h-14 text-right text-sm">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-md"
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
