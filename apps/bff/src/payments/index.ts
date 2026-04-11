/**
 * Payment provider factory
 * Returns the configured payment provider based on PAYMENT_PROVIDER env variable
 */

import { polarProvider } from "./polar";
import { stripeProvider } from "./stripe";
import type { PaymentProvider, PaymentProviderInterface } from "./types";

export * from "./types";

const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER ?? "polar") as PaymentProvider;

console.log(`[Payments] Using payment provider: ${PAYMENT_PROVIDER}`);

export function getPaymentProvider(): PaymentProviderInterface {
  switch (PAYMENT_PROVIDER) {
    case "stripe":
      return stripeProvider;
    default:
      return polarProvider;
  }
}

export function getPaymentProviderName(): PaymentProvider {
  return PAYMENT_PROVIDER;
}

// Export the active provider as default for convenience
export const paymentProvider = getPaymentProvider();

// Re-export individual providers for direct access if needed
export { polarProvider } from "./polar";
export { stripeProvider } from "./stripe";

export * from "./utils";
