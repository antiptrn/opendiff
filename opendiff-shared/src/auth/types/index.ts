export type SubscriptionTier = "FREE" | "CODE_REVIEW" | "TRIAGE" | "BYOK";
export type SubscriptionStatus = "INACTIVE" | "ACTIVE" | "CANCELLED" | "PAST_DUE";
export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";
export type AccountType = "SOLO" | "TEAM";

export interface SeatInfo {
  tier: SubscriptionTier;
  status: SubscriptionStatus | null;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  role: OrganizationRole;
  isPersonal?: boolean; // True for solo user's auto-created org
  // Per-seat subscription info
  seat: SeatInfo | null;
}

export type AuthProvider = "github" | "google";

export interface User {
  id: number | string;
  visitorId?: string;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
  access_token?: string;
  auth_provider?: AuthProvider;
  hasGithubLinked?: boolean; // For Google users who have linked their GitHub
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
  polarProductId?: string | null;
  cancelAtPeriodEnd?: boolean;
  accountType?: AccountType | null;
  onboardingCompletedAt?: string | null;
  personalOrgId?: string | null; // The org created for solo users (hidden from switcher)
  organizations?: UserOrganization[];
  hasOrganizations?: boolean;
}

// Multi-account storage structure
export interface AccountsStorage {
  accounts: User[];
  activeAccountId: string | null;
}
