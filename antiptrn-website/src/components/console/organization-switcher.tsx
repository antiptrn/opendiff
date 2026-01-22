import { Check, Building2, Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useOrganization } from "@/hooks/use-organization";
import { useNavigate } from "react-router-dom";

export function OrganizationSwitcher() {
  const navigate = useNavigate();
  const { organizations, currentOrg, switchOrg } = useOrganization();

  if (!currentOrg) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="justify-between h-9 rounded-lg"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Building2 className="size-3.5 shrink-0" />
            <span className="truncate">{currentOrg.name}</span>
          </div>
          <ChevronDown className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => switchOrg(org.id)}
            className="cursor-pointer"
          >
            <Building2 className="size-3.5 mr-1" />
            <span className="truncate flex-1">{org.name}</span>
            {currentOrg.id === org.id && (
              <Check className="ml-auto size-3.5" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate("/create-organization")}
          className="cursor-pointer"
        >
          <Plus className="size-3.5" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
