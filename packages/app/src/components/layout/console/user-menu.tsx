import { LifeBuoy, Loader2, LogOut, MessageSquare, Settings, UserPlus, Users } from "lucide-react";
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
import type { useAuth } from "shared/auth";
import { Link, useLocation } from "react-router-dom";

type AuthUser = NonNullable<ReturnType<typeof useAuth>["user"]>;
type AuthAccount = ReturnType<typeof useAuth>["accounts"][number];

/** Dropdown menu showing the current user's avatar with account switching and sign-out options. */
export function UserMenu({
  user,
  accounts,
  switchingToAccountId,
  onSwitchAccount,
  onFeedbackClick,
  onLogout,
}: {
  user: AuthUser;
  accounts: AuthAccount[];
  switchingToAccountId: string | null;
  onSwitchAccount: (account: AuthAccount) => void;
  onFeedbackClick: () => void;
  onLogout: () => void;
}) {
  const location = useLocation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="size-9 cursor-pointer flex items-center rounded-full group"
        >
          <Avatar>
            <AvatarImage src={user.avatar_url} />
            <AvatarFallback>{user.login.charAt(0)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="w-64">
        {/* Current user with submenu for account switching */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2 px-3">
            <Users className="size-4" strokeWidth={2.6} />
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
                        className="flex items-center gap-2.5 cursor-pointer"
                      >
                        {isSwitching ? (
                          <Loader2 className="size-4 animate-spin" />
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
            <DropdownMenuItem asChild className="cursor-pointer flex items-center gap-2 px-3">
              <Link
                to={`/login?addAccount=true&redirectUrl=${encodeURIComponent(location.pathname)}`}
              >
                <UserPlus className="size-4" strokeWidth={2.6} />
                Add account
              </Link>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link to="/console/settings">
            <Settings className="size-4" strokeWidth={2.6} />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer">
          <a href="mailto:support@opendiff.dev?subject=Support%20Request">
            <LifeBuoy className="size-4" strokeWidth={2.6} />
            Support
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onFeedbackClick} className="cursor-pointer">
          <MessageSquare className="size-4" strokeWidth={2.6} />
          Feedback
        </DropdownMenuItem>
        {/* Sign out - in main dropdown */}
        <DropdownMenuItem onClick={onLogout} className="cursor-pointer">
          <LogOut className="size-4" strokeWidth={2.6} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
