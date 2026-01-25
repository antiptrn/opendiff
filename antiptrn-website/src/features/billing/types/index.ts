import type { SubscriptionTier, SubscriptionStatus } from "@features/auth";

export interface SubscriptionInfo {
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  polarSubscriptionId: string | null;
  subscriptionExpiresAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface Order {
  id: string;
  createdAt: string;
  amount: number;
  currency: string;
  status: string;
  productName: string;
}

export interface BillingData {
  subscription: {
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    expiresAt: string | null;
    cancelAtPeriodEnd: boolean;
  };
  orders: Order[];
}
