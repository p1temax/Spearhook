import * as React from "react";
import { cn } from "@/lib/utils";

const CHEVRON_BG =
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23737373%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E";

/**
 * Native `<select>` styled to match the Nova input control. Used where a
 * Radix listbox would add no value (short option lists, form posts).
 *
 * The chevron is drawn with the `background-image` CSS property instead of an
 * arbitrary background utility so tailwind-merge cannot drop `bg-background`
 * as a conflicting background class.
 */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    style={{
      backgroundImage: `url("${CHEVRON_BG}")`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 0.5rem center",
      backgroundSize: "16px 16px",
    }}
    className={cn(
      "flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm shadow-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";
