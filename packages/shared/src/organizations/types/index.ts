// Re-export auth types that are used by organization consumers
export type { OrganizationRole, SubscriptionTier, UserOrganization } from "../../auth";

// Org-level subscription info
export interface OrgSubscription {
  tier: import("../../auth").SubscriptionTier;
  status: "ACTIVE" | "CANCELLED" | "PAST_DUE" | "INACTIVE";
  seatCount: number;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface OrganizationMember {
  userId: string;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: import("../../auth").OrganizationRole;
  joinedAt: string;
  hasSeat: boolean; // Whether this member has a seat assigned
}

export interface QuotaPool {
  total: number;
  used: number;
  hasUnlimited: boolean;
}

export interface SeatsInfo {
  available: number;
  assigned: number;
  total: number;
}

export interface MembersResponse {
  members: OrganizationMember[];
  quotaPool: QuotaPool;
  seats: SeatsInfo;
}

export interface OrganizationInvite {
  id: string;
  email: string | null;
  token: string;
  role: import("../../auth").OrganizationRole;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface OrganizationDetails {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  membersCount: number;
  role: import("../../auth").OrganizationRole;
  createdAt: string;
  hasSeat: boolean; // Current user's seat assignment
  subscription: OrgSubscription | null; // Org subscription info
  quotaPool: QuotaPool;
  seats: SeatsInfo;
  // Business info (for invoicing)
  isRegisteredBusiness: boolean;
  businessName: string | null;
  taxVatId: string | null;
}

export interface SeatChangePreview {
  currentSeats: number;
  newSeats: number;
  proratedCharge: number; // cents
  nextBillingAmount: number; // cents
  effectiveNow: boolean;
}

/**
 * Value type for the organization context
 */
export interface OrganizationContextValue {
  /** Currently selected organization ID */
  selectedOrgId: string | null;
  /** Function to update the selected organization ID */
  setSelectedOrgId: (orgId: string | null) => void;
}
