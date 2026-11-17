import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type CurrentUser = { id: string; email: string; isDemo: boolean };

/** Verified user for the current request, or null. Deduplicated per render. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const appMetadata = (claims.app_metadata ?? {}) as { demo?: boolean };
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    isDemo: appMetadata.demo === true,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
