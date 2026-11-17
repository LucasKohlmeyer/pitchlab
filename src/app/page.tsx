import Link from "next/link";
import { signInDemo } from "@/app/auth-actions";
import { Logo } from "@/components/logo";

const FEATURES = [
  {
    title: "Log every pitch",
    body: "Record bullpens and games pitch by pitch: type, velocity, spin, break, count, result, and a click-to-place plate location.",
  },
  {
    title: "Import Rapsodo and TrackMan",
    body: "Drop in a CSV export, confirm the column mapping, review validation warnings, and load a whole session at once.",
  },
  {
    title: "See your arsenal",
    body: "Velocity trends, pitch mix by count, strike, whiff and chase rates, location heatmaps, and a movement plot.",
  },
  {
    title: "Catch fatigue early",
    body: "A rolling-velocity test flags the pitch where your fastball drops significantly below that outing's baseline.",
  },
  {
    title: "Model your whiffs",
    body: "A logistic regression fit in the app estimates whiff probability from pitch features, with every coefficient explained.",
  },
  {
    title: "Yours alone",
    body: "Email and password accounts with row level security in Postgres, so each pitcher only ever sees their own data.",
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <Link href="/login" className="btn btn-secondary">
          Sign in
        </Link>
      </header>

      <section className="py-16 sm:py-24">
        <p className="text-sm font-medium text-ink-3">Pitching analytics, built by a pitcher</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Know what your stuff is doing, pitch by pitch.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-2">
          PitchLab turns bullpen and game data into velocity trends, movement profiles, command maps, fatigue
          alerts, and a whiff-probability model you can actually read.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <form action={signInDemo}>
            <button type="submit" className="btn btn-primary px-5 py-2.5">
              Explore the live demo
            </button>
          </form>
          <Link href="/signup" className="btn btn-secondary px-5 py-2.5">
            Create an account
          </Link>
        </div>
        <p className="mt-3 text-sm text-ink-3">
          The demo is a read-only account for a left-hander sitting 88 to 91 with a four-seam, two-seam, and slurve.
        </p>
      </section>

      <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card">
            <h2 className="font-medium">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto border-t border-line py-6 text-sm text-ink-3">
        Built with Next.js, Supabase, Tailwind, and Recharts.
      </footer>
    </main>
  );
}
