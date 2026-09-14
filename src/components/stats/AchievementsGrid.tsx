import type { Achievement } from "@/lib/analytics";

export function AchievementsGrid({ achievements }: { achievements: Achievement[] }) {
  return (
    <div className="room-panel p-5 sm:p-6">
      <p className="eyebrow">Achievements</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {achievements.map((item) => (
          <li
            key={item.id}
            className={`rounded-2xl border px-4 py-3 ${
              item.unlocked
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/10"
                : "border-[var(--line)] bg-[var(--panel-strong)] opacity-70"
            }`}
          >
            <p className="font-semibold text-[var(--ink)]">{item.title}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{item.description}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
              {item.unlocked ? "Unlocked" : "Locked"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
