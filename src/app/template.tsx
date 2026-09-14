"use client";

import { usePathname } from "next/navigation";

/** Remounts on route change so enter animation plays on every navigation. */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition flex min-h-full flex-1 flex-col">
      {children}
    </div>
  );
}
