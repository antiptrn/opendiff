import { Card, cn } from "components";

interface Props {
    className?: string;
    title: string;
    description: string;
    children: React.ReactNode;
    grid?: boolean;
}

export default function FeatureCard({ className, title, description, children, grid = false }: Props) {
    return (
        <Card className={cn("w-full lg:h-100 md:h-100 h-auto bg-card p-6 gap-4 flex flex-col items-start justify-between", className)}>
            <div className="flex flex-col items-start justify-start gap-3">
                <h5 className="text-xl">{title}</h5>
                <p className="text-muted-foreground text-lg">{description}</p>
            </div>
            <div
                className={cn(
                    "mt-6 w-full text-foreground items-center justify-start gap-4",
                    grid ? "grid lg:grid-cols-2 md:grid-cols-2 grid-cols-1" : "flex flex-wrap"
                )}
            >
                {children}
            </div>
        </Card>
    );
}
