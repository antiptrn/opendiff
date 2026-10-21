import { Download04Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "components/components/ui/button";
import { SettingsSection } from "components/components/console";
import { Skeleton } from "components/components/ui/skeleton";
import { useState } from "react";
import type { useAuth } from "shared/auth";
import { formatCurrency, formatDate } from "shared/billing";
import { useBilling, useGetInvoice } from "shared/billing";
import { toast } from "sonner";

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

  const orders = billing?.orders || [];

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
    <SettingsSection title="Billing history">
      <div>
        {isLoading ? (
          <div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex justify-between items-center h-14 border-b last:border-0"
              >
                <Skeleton muted className="h-6 w-24 rounded-md" />
                <Skeleton muted className="h-6 w-40 rounded-md" />
                <Skeleton muted className="h-6 w-16 rounded-md" />
                <Skeleton muted className="size-9 rounded-full" />
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
                    <td className="h-14 text-base">
                      <span className="inline-flex items-center gap-1.5">
                        {formatDate(order.createdAt)}
                      </span>
                    </td>
                    <td className="h-14 text-base">
                      {isSoloUser
                        ? order.productName
                            .replace(/^1\s*[×x]\s*/i, "")
                            .replace(/\(at\s+/i, "at ")
                            .replace(/\s*\/\s*(month|year)\)/, " / $1")
                        : order.productName}
                    </td>
                    <td className="h-14 text-base">
                      {formatCurrency(order.amount, order.currency)}
                    </td>
                    <td className="h-14 text-right text-sm">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleDownloadInvoice(order.id)}
                        disabled={downloadingInvoice === order.id}
                      >
                        {downloadingInvoice === order.id ? (
                          <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                        ) : (
                          <HugeiconsIcon icon={Download04Icon} className="size-4" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
