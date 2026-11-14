"use client";

import { motion } from "motion/react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Shared route transition. The key is derived from the pathname so React
 * remounts the subtree and Motion can play the enter animation.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pathname } = useLocation();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}
    >
      {children}
    </motion.div>
  );
}
