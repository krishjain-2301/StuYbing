import Link from "next/link";
import { signOut } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function AppNav({ username }: { username?: string | null }) {
  return (
    <div className="nav-shell">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href={username ? "/dashboard" : "/"}
          className="font-display text-2xl font-bold tracking-tight text-[var(--ink)]"
        >
          StuYbing
        </Link>
        <nav className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
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
        </nav>
      </header>
    </div>
  );
}
