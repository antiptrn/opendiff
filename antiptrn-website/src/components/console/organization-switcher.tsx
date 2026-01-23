import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useOrganization } from "@/hooks/use-organization";
import { Building2, Check, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { cn } from "@/lib/utils";

export function OrganizationSwitcher() {
  const { organizations, currentOrg, switchOrg } = useOrganization();
  const [isOpen, setIsOpen] = useState(false);

  if (!currentOrg) {
    return null;
  }

  // If only one organization, just show the name without dropdown
  if (organizations.length <= 1) {
    return (
      <div className="flex items-center gap-2 h-9 px-1.5">
        <Avatar className="size-6 !rounded-md overflow-hidden">
          <AvatarImage className="rounded-none" src={currentOrg.avatarUrl ?? undefined} alt={currentOrg.name} />
          <AvatarFallback className="text-sm rounded-none">{currentOrg.name.charAt(0)}</AvatarFallback>
        </Avatar>
      </div>
    );
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2 justify-between h-9 rounded-lg px-1.5 !bg-transparent text-foreground/80 hover:text-foreground"
        >
          <Avatar className="size-6 rounded-md overflow-hidden">
            <AvatarImage className="rounded-none" src={currentOrg.avatarUrl ?? undefined} alt={currentOrg.name} />
            <AvatarFallback className="text-sm rounded-none">{currentOrg.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        <DropdownMenuLabel>Teams</DropdownMenuLabel>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
