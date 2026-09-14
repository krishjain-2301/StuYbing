"use client";

import { formatHoursMinutes } from "@/lib/utils";

function heatClass(seconds: number): string {
  if (seconds <= 0) return "bg-[var(--heat-1)] opacity-50";
  if (seconds < 30 * 60) return "bg-[var(--heat-2)]";
  if (seconds < 2 * 3600) return "bg-[var(--heat-3)]";
  return "bg-[var(--heat-4)]";
}

export function StudyCalendar({
  year,
  monthIndex,
  cells,
}: {
  year: number;
  monthIndex: number;
  cells: { date: string; seconds: number }[];
}) {
  const firstDow = new Date(year, monthIndex, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  const monthName = new Date(year, monthIndex, 1).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="room-panel p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Study history</p>
        <p className="text-sm font-medium text-[var(--ink-soft)]">{monthName}</p>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`pad-${i}`} className="heat-cell opacity-0" />
        ))}
        {cells.map((cell) => {
          const day = Number(cell.date.slice(-2));
          return (
            <div
              key={cell.date}
              className={`heat-cell flex items-center justify-center text-[0.65rem] font-medium ${
                cell.seconds >= 2 * 3600 ? "text-black" : "text-[var(--ink)]"
              } ${heatClass(cell.seconds)}`}
              title={`${cell.date}: ${formatHoursMinutes(cell.seconds)}`}
            >
              {day}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]">
        <span>Low</span>
        <span className="heat-cell w-4 bg-[var(--heat-1)]" />
        <span className="heat-cell w-4 bg-[var(--heat-2)]" />
        <span className="heat-cell w-4 bg-[var(--heat-3)]" />
        <span className="heat-cell w-4 bg-[var(--heat-4)]" />
        <span>High</span>
      </div>
    </div>
  );
}
