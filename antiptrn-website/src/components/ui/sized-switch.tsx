import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const SizedSwitch = ({ size, ...props }: { size: "small" | "medium" | "large" } & React.ComponentProps<typeof Switch>) => {
    return (
        <Switch aria-label='Small switch' className={cn("h-5 w-9 [&_span]:size-4 data-[state=checked]:[&_span]:translate-x-4.5 data-[state=checked]:[&_span]:rtl:-translate-x-4.5", size === "small" && "h-5 w-9 [&_span]:size-4 data-[state=checked]:[&_span]:translate-x-4.5 data-[state=checked]:[&_span]:rtl:-translate-x-4.5")} {...props} />
    )
}

export default SizedSwitch
