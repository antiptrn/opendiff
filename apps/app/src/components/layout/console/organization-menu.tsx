import { PlusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "components/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "components/components/ui/dropdown-menu";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useOrganization } from "shared/organizations";

/**
 * Dropdown from the organization row at the top of the sidebar: the organizations to switch
 * between (personal ones aren't listed) and a way to create a new one.
 */
export function OrganizationMenu({ trigger }: { trigger: ReactNode }) {
  const { organizations, currentOrgId, switchOrg } = useOrganization();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-64">
        {organizations.length > 0 && (
          <>
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                className="cursor-pointer"
                onClick={() => switchOrg(org.id)}
              >
                <Avatar className="size-4.5 rounded-xs">
                  <AvatarImage src={org.avatarUrl || undefined} alt="" />
                  <AvatarFallback className="rounded-xs text-[10px]">
                    {org.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{org.name}</span>
                {org.id === currentOrgId && (
                  <HugeiconsIcon icon={Tick02Icon} className="size-4" aria-label="Current" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link to="/create-organization?new">
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            Create organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
