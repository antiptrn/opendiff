import { Download04Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { TableEmpty } from "@/components/paginated-table";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "components/components/ui/button";
import { SettingsSection } from "components/components/console";
import { DataTable } from "components/components/ui/data-table";
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
    <SettingsSection title="Billing history" fullBleed>
      <div>
        {!isLoading && orders.length === 0 ? (
          <TableEmpty
            title="No billing history yet"
            description="Invoices for your plan show up here after your first payment."
          />
        ) : (
          <DataTable
            label="Billing history"
            rows={orders}
            getKey={(order) => order.id}
            columns={[
              { key: "date", header: "Date", cell: (order) => formatDate(order.createdAt) },
              {
                key: "plan",
                header: "Plan",
                cell: (order) =>
                  isSoloUser
                    ? order.productName
                        .replace(/^1\s*[×x]\s*/i, "")
                        .replace(/\(at\s+/i, "at ")
                        .replace(/\s*\/\s*(month|year)\)/, " / $1")
                    : order.productName,
              },
              {
                key: "amount",
                header: "Amount",
                cell: (order) => formatCurrency(order.amount, order.currency),
                align: "end",
              },
              {
                key: "invoice",
                header: <span className="sr-only">Invoice</span>,
                className: "w-12",
                cell: (order) => (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Download invoice"
                    onClick={() => handleDownloadInvoice(order.id)}
                    disabled={downloadingInvoice === order.id}
                  >
                    {downloadingInvoice === order.id ? (
                      <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                    ) : (
                      <HugeiconsIcon icon={Download04Icon} className="size-4" />
                    )}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </div>
    </SettingsSection>
  );
}
