import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "../../../utils/cn"

function BreadcrumbLink({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "font-normal text-foreground transition-colors hover:text-foreground",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  })
}

export { BreadcrumbLink }
