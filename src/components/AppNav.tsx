import Link from "next/link";
import { signOut } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function AppNav({ username }: { username?: string | null }) {
  return (
    <div className="nav-shell">
      <header className="flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href={username ? "/dashboard" : "/"}
          className="shrink-0 font-display text-2xl font-bold tracking-tight text-[var(--ink)]"
        >
          StuYbing
        </Link>
        <nav className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
          {username ? (
            <>
              <Link href="/dashboard" className="btn-ghost hidden sm:inline-flex">
                Dashboard
              </Link>
              <Link href="/stats" className="btn-ghost hidden sm:inline-flex">
                Stats
              </Link>
              <span className="hidden rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] md:inline">
                @{username}
              </span>
              <form action={signOut}>
                <button type="submit" className="btn-ghost">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Log in
              </Link>
              <Link href="/signup" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </header>
    </div>
  );
}
