import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Lit from within, like a lamp — the warm shadow is what makes it feel
        // pressable rather than painted on.
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_0_oklch(1_0_0/25%)_inset,0_8px_24px_-10px_oklch(0.79_0.155_68/70%)] hover:bg-primary/90 hover:shadow-[0_1px_0_oklch(1_0_0/25%)_inset,0_10px_28px_-8px_oklch(0.79_0.155_68/85%)]",
        gold: "bg-gradient-to-b from-gold to-primary text-primary-foreground shadow-[0_1px_0_oklch(1_0_0/30%)_inset,0_10px_30px_-12px_oklch(0.85_0.13_88/80%)] hover:brightness-110",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Deliberately large. This is a creative tool used on phones as much as
      // desktops, and the old 32px controls read as a settings panel rather
      // than something you make things with.
      size: {
        default: "h-10 gap-2 px-4",
        xs: "h-7 gap-1 rounded-lg px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1.5 rounded-xl px-3.5 text-[0.8125rem]",
        lg: "h-12 gap-2 rounded-2xl px-6 text-[0.9375rem]",
        xl: "h-14 gap-2.5 rounded-2xl px-8 text-base",
        icon: "size-10",
        "icon-xs": "size-7 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9 rounded-xl",
        "icon-lg": "size-12 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
