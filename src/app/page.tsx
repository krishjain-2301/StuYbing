import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    username = profile?.username || null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppNav username={username} />
      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-4 pb-16 pt-10 sm:justify-center sm:px-6 sm:pb-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh] overflow-hidden">
          <div className="absolute left-[-10%] top-[10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,var(--bg-spot-a),transparent_68%)] blur-2xl" />
          <div className="absolute right-[-5%] top-[20%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,var(--bg-spot-b),transparent_70%)] blur-2xl" />
          <div className="absolute bottom-10 left-1/2 h-px w-[70%] -translate-x-1/2 bg-gradient-to-r from-transparent via-[var(--line)] to-transparent" />
        </div>

        <p className="hero-rise font-display text-[clamp(3.8rem,14vw,8.5rem)] font-extrabold leading-[0.9] tracking-[-0.04em] text-[var(--ink)]">
          StuYbing
        </p>
        <h1 className="hero-rise-delay mt-6 max-w-2xl text-xl font-medium leading-snug text-[var(--ink-soft)] sm:text-3xl">
          Study together. Stay accountable. Compete. Improve.
        </h1>
        <p className="hero-rise-delay mt-4 max-w-xl text-base text-[var(--muted)] sm:text-lg">
          Live study rooms with timers, screen share that never records, tasks,
          streaks, and leaderboards — built for focused friend groups.
        </p>
        <div className="hero-rise-delay mt-10 flex flex-wrap gap-3">
          {user ? (
            <Link href="/dashboard" className="btn-primary">
              Enter dashboard
            </Link>
          ) : (
            <>
              <Link href="/signup" className="btn-primary">
                Start studying
              </Link>
              <Link href="/login" className="btn-secondary">
                Log in
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
