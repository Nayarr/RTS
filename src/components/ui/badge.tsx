import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/**
 * Pastille de la maquette : teinte claire, bord et texte dans la couleur `--c`
 * (passe une couleur précise avec `style={{ '--c': couleur }}` ou la prop `color`).
 */
const badgeVariants = cva(
  "badge w-fit shrink-0 overflow-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "s-green",
        secondary: "s-grey",
        destructive: "s-bad",
        outline: "s-grey",
        warning: "s-warn",
        success: "s-ok",
        info: "s-blue",
        ghost: "s-grey",
        link: "border-0 bg-transparent text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  color,
  dot = false,
  style,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean; color?: string; dot?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), dot && "dot", className)}
      style={color ? ({ "--c": color, ...style } as React.CSSProperties) : style}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
