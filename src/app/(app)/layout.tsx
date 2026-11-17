import Link from "next/link";
import { signOut } from "@/app/auth-actions";
import { Logo } from "@/components/logo";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
          <Link href="/dashboard" aria-label="PitchLab dashboard">
            <Logo size={24} />
          </Link>
          <Nav />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-ink-3 sm:inline">{user.isDemo ? "Demo account" : user.email}</span>
            <form action={signOut}>
              <button type="submit" className="btn btn-secondary px-3 py-1.5">
                Sign out
              </button>
            </form>
          </div>
        </div>
        {user.isDemo && (
          <div className="border-t border-line bg-surface">
            <p className="mx-auto w-full max-w-6xl px-5 py-2 text-sm text-ink-2">
              You are viewing the read-only demo. Logging, editing, and importing are turned off.{" "}
              <Link href="/signup" className="text-ink underline underline-offset-4">
                Create an account
              </Link>{" "}
              to track your own outings.
            </p>
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">{children}</main>
    </>
  );
}
