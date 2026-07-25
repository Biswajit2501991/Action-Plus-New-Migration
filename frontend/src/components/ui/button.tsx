import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Premium enterprise button styles — Linear / Stripe / Atlassian inspired.
 * Behaviour and variants unchanged; polish only.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-lg text-sm font-semibold tracking-tight",
    "transition-[background-color,border-color,box-shadow,transform,opacity,color] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
    "active:scale-[0.98]",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-slate-900 text-white shadow-sm",
          "hover:bg-slate-800 hover:shadow",
          "dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400",
        ].join(" "),
        secondary: [
          "bg-slate-100 text-slate-800 shadow-sm border border-slate-200/80",
          "hover:bg-slate-200/90 hover:border-slate-300",
          "dark:bg-white/10 dark:text-slate-100 dark:border-white/10 dark:hover:bg-white/15",
        ].join(" "),
        outline: [
          "border border-slate-300 bg-white text-slate-800 shadow-sm",
          "hover:bg-slate-50 hover:border-slate-400",
          "dark:border-white/15 dark:bg-transparent dark:text-slate-100 dark:hover:bg-white/[0.06]",
        ].join(" "),
        ghost: [
          "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
          "dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white",
        ].join(" "),
        destructive: [
          "bg-rose-600 text-white shadow-sm",
          "hover:bg-rose-700 hover:shadow",
          "dark:bg-rose-500 dark:hover:bg-rose-400",
        ].join(" "),
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = "Button";
