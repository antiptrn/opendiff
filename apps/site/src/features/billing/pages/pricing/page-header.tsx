interface PageHeaderProps {
  title: string;
  subtitle: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className="relative z-10 flex flex-col items-center justify-center text-center">
      <h5 className="max-w-[609px] pb-1 text-[40px] leading-tight font-normal md:text-[63px]">
        {title}
      </h5>
      <p className="mx-auto mt-2.5 max-w-[609px] text-balance text-base leading-7 text-muted-foreground md:mt-4 md:text-xl lg:mt-4 lg:text-xl">
        {subtitle}
      </p>
    </div>
  );
}
