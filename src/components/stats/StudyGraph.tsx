"use client";

import { formatHoursMinutes } from "@/lib/utils";

export function StudyGraph({
  series,
}: {
  series: { label: string; seconds: number }[];
}) {
  const max = Math.max(1, ...series.map((s) => s.seconds));

  return (
    <div className="room-panel p-5 sm:p-6">
      <p className="eyebrow">This week</p>
      <div className="mt-5 flex h-40 items-end gap-2 sm:gap-3">
        {series.map((item, index) => {
          const height = Math.max(6, Math.round((item.seconds / max) * 100));
          return (
            <div key={`${item.label}-${index}`} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-32 w-full items-end justify-center">
                <div
                  className="graph-bar w-full max-w-8"
                  style={{ height: `${height}%` }}
                  title={formatHoursMinutes(item.seconds)}
                />
              </div>
              <span className="text-xs font-medium text-[var(--muted)]">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
