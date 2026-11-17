"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signInDemo, signUp, type AuthState } from "@/app/auth-actions";

const initial: AuthState = {};

export function AuthForm({ mode, notice }: { mode: "login" | "signup"; notice?: string }) {
  const [state, action, pending] = useActionState(mode === "login" ? signIn : signUp, initial);
  const error = state.error ?? notice;

  return (
    <div className="card w-full max-w-sm">
      <h1 className="text-lg font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
      <p className="mt-1 text-sm text-ink-3">
        {mode === "login" ? "Welcome back to PitchLab." : "Start logging outings in a minute."}
      </p>

      <form action={action} className="mt-5 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
            className="field"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        {state.message && <p className="text-sm text-ink-2">{state.message}</p>}
        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? "Working…" : mode === "login" ? "Sign in" : "Sign up"}
        </button>
      </form>

      <form action={signInDemo} className="mt-3">
        <button type="submit" className="btn btn-secondary w-full">
          Try the demo account
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-ink-3">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="text-ink underline underline-offset-4">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-ink underline underline-offset-4">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
