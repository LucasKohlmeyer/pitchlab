import type { Metadata } from "next";
import { ImportWizard } from "@/components/import-wizard";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Import" subtitle="Load a whole session from a Rapsodo or TrackMan CSV export." />
      <ImportWizard readOnly={user.isDemo} />
    </>
  );
}
