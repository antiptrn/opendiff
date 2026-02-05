import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Button } from "opendiff-components/components/ui/button";
import { Input } from "opendiff-components/components/ui/input";
import { useState } from "react";

interface TeamCardProps {
  isYearly: boolean;
  onGetStarted: (seatCount: number) => void;
  isLoading: boolean;
}

/** Displays team pricing with seat selector */
export function TeamCard({ isYearly, onGetStarted, isLoading }: TeamCardProps) {
  const [seatCount, setSeatCount] = useState(5);
  const monthlyPricePerSeat = 49;
  const yearlyPricePerSeat = 490;
  const pricePerSeat = isYearly ? yearlyPricePerSeat / 12 : monthlyPricePerSeat;
  const totalPrice = pricePerSeat * seatCount;
  const monthlyReviewQuota = 250;
  const yearlySavings = (monthlyPricePerSeat * 12 - yearlyPricePerSeat) * seatCount;

  return (
    <div className="rounded-xl bg-card p-8 mt-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex-1">
          <h3 className="text-xl font-semibold">Team</h3>
          <p className="text-muted-foreground mt-1">
            For teams that need multiple seats. All the features of Triage, with volume pricing.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <li className="flex items-center gap-1.5 text-sm">
              <Check className="size-4 text-green-600 dark:text-green-400" />
              <span>Unlimited repositories</span>
            </li>
            <li className="flex items-center gap-1.5 text-sm">
              <Check className="size-4 text-green-600 dark:text-green-400" />
              <span>Priority support</span>
            </li>
            <li className="flex items-center gap-1.5 text-sm">
              <Check className="size-4 text-green-600 dark:text-green-400" />
              <span>Triage mode</span>
            </li>
            <li className="flex items-center gap-1.5 text-sm">
              <Check className="size-4 text-green-600 dark:text-green-400" />
              <span>Shared review pool</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col items-center gap-4 md:items-end">
          {/* Seat selector */}
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={2}
              max={100}
              value={seatCount}
              onChange={(e) => {
                const val = Number.parseInt(e.target.value, 10) || 2;
                setSeatCount(Math.max(2, Math.min(100, val)));
              }}
              className="w-20 text-center text-lg font-semibold"
            />
            <span className="text-sm text-muted-foreground">seats</span>
          </div>

          {/* Pricing */}
          <div className="text-center md:text-right">
            <NumberFlow
              value={isYearly ? Math.round(totalPrice * 2) / 2 : totalPrice}
              format={{
                style: "currency",
                currency: "USD",
                maximumFractionDigits: isYearly ? 2 : 0,
              }}
              suffix="/month"
              className="text-2xl font-semibold"
            />
            <p className="text-sm text-muted-foreground">
              ${isYearly ? (yearlyPricePerSeat / 12).toFixed(2) : monthlyPricePerSeat}/seat ×{" "}
              {seatCount} seats
            </p>
            <p className="text-sm text-muted-foreground">
              {monthlyReviewQuota * seatCount} reviews/month pooled
            </p>
            <AnimatePresence initial={false}>
              {isYearly && (
                <motion.p
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-sm text-green-600 dark:text-green-400 mt-1 overflow-hidden"
                >
                  Save{" "}
                  <NumberFlow
                    value={yearlySavings}
                    format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
                  />
                  /year
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <Button size="lg" disabled={isLoading} onClick={() => onGetStarted(seatCount)}>
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            Get started with {seatCount} seats
          </Button>
        </div>
      </div>
    </div>
  );
}
