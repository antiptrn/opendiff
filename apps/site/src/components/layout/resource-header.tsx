import { Separator } from "components/components/ui/separator";

interface ResourceHeaderProps {
  title: string;
}

export function ResourceHeader({ title }: ResourceHeaderProps) {
  return (
    <>
      <div className="mb-4 flex w-full flex-row items-start justify-start">
        <h1 className="text-3xl leading-tight md:text-5xl lg:text-5xl">{title}</h1>
      </div>
      <Separator />
    </>
  );
}
