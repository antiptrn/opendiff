import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "opendiff-components/components/ui/card";
import { Separator } from "opendiff-components/components/ui/separator";
import { formatCents } from "opendiff-components/utils";

/** Props for SeatChangePreview including proration preview data and seat pricing. */
interface SeatChangePreviewProps {
  hasChanges: boolean;
  willReactivate: boolean;
  isLoadingPreview: boolean;
  preview: {
    proratedCharge: number;
    nextBillingAmount: number;
  } | null;
  displaySeatCount: number;
  pricePerSeat: number;
}

/** Animated card showing prorated charge and next billing amount when seat count changes. */
export function SeatChangePreview({
  hasChanges,
  willReactivate,
  isLoadingPreview,
  preview,
  displaySeatCount,
  pricePerSeat,
}: SeatChangePreviewProps) {
  return (
    <AnimatePresence>
      {hasChanges && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="bg-muted/50 my-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Charge today</CardTitle>
              {willReactivate && (
                <CardDescription className="text-green-600">
                  This will reactivate your subscription
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {isLoadingPreview ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Calculating proration...</span>
                </div>
              ) : preview ? (
                <dl className="text-sm">
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground text-base">Amount</dt>
                    <dd>
                      {preview.proratedCharge !== 0 ? (
                        <>
                          {preview.proratedCharge > 0 ? (
                            <span>{formatCents(preview.proratedCharge)}</span>
                          ) : (
                            <span className="text-green-600">
                              {formatCents(preview.proratedCharge)}
                            </span>
                          )}
                          <span className="text-muted-foreground ml-1">
                            {preview.proratedCharge > 0 ? "(prorated)" : "(credit)"}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">$0.00</span>
                      )}
                    </dd>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground text-base">Next billing</dt>
                    <dd>{formatCents(preview.nextBillingAmount)}/month</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  New total: ${displaySeatCount * pricePerSeat}/month
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
