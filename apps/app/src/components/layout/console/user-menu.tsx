import { ArrowLeftRightIcon, Loading03Icon, LogOutIcon, MessageSquareIcon, UserPlusIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "components/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "components/components/ui/dropdown-menu";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { useAuth } from "shared/auth";

type AuthUser = NonNullable<ReturnType<typeof useAuth>["user"]>;
type AuthAccount = ReturnType<typeof useAuth>["accounts"][number];

/** Dropdown menu with account switching, feedback and sign-out, opened from `trigger`. */
export function UserMenu({
  user,
  accounts,
  switchingToAccountId,
  onSwitchAccount,
  onFeedbackClick,
  onLogout,
  trigger,
}: {
  user: AuthUser;
  accounts: AuthAccount[];
  switchingToAccountId: string | null;
  onSwitchAccount: (account: AuthAccount) => void;
  onFeedbackClick: () => void;
  onLogout: () => void;
  trigger: ReactNode;
}) {
  const location = useLocation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        {/* Current user with submenu for account switching */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={ArrowLeftRightIcon} className="size-4" />
            Switch account
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            {/* Other accounts to switch to */}
            {accounts.filter(
              (a) => String(a.visitorId || a.id) !== String(user.visitorId || user.id)
            ).length > 0 && (
              <>
                <DropdownMenuLabel>Switch account</DropdownMenuLabel>
                {accounts
                  .filter(
                    (account) =>
                      String(account.visitorId || account.id) !== String(user.visitorId || user.id)
                  )
                  .map((account) => {
                    const accountId = String(account.visitorId || account.id);
                    const isSwitching = switchingToAccountId === accountId;
                    return (
                      <DropdownMenuItem
                        key={accountId}
                        onClick={() => onSwitchAccount(account)}
                        disabled={isSwitching || !!switchingToAccountId}
                        className="cursor-pointer"
                      >
                        {isSwitching ? (
                          <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                        ) : (
                          <Avatar className="size-4.5">
                            <AvatarImage src={account.avatar_url} />
                            <AvatarFallback>{account.login.charAt(0)}</AvatarFallback>
                          </Avatar>
                        )}
                        <span>{account.login}</span>
                      </DropdownMenuItem>
                    );
                  })}
              </>
            )}

            {/* Add account */}
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link
                to={`/login?addAccount=true&redirectUrl=${encodeURIComponent(location.pathname)}`}
              >
                <HugeiconsIcon icon={UserPlusIcon} className="size-4" />
                Add account
              </Link>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={onFeedbackClick} className="cursor-pointer">
          <HugeiconsIcon icon={MessageSquareIcon} className="size-4" />
          Leave feedback
        </DropdownMenuItem>
        {/* Sign out - in main dropdown */}
        <DropdownMenuItem onClick={onLogout} className="cursor-pointer">
          <HugeiconsIcon icon={LogOutIcon} className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
