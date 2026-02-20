import { Card, CardContent } from "components";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description: string;
  Icon?: LucideIcon;
}

export default function HighlightCard({ title, description, Icon }: Props) {
  return (
    <Card className="w-full lg:h-48 md:h-48 h-auto flex flex-col items-start justify-start overflow-hidden">
      <CardContent>
        {Icon && <Icon className="size-5 text-foreground" />}
        <p className="text-xl mt-8 line-clamp-1">{title}</p>
        <p className="mt-2 text-muted-foreground text-base line-clamp-2">{description}</p>
      </CardContent>
    </Card>
  );
}
