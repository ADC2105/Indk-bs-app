import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ManualTextImport from "@/components/ManualTextImport";
import ManualImageImport from "@/components/ManualImageImport";
import ManualOfferForm from "@/components/ManualOfferForm";

export default async function TilbudImportPage() {
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name").eq("enabled", true).order("name");

  if (!stores || stores.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Manuel import</h1>
        <p className="text-sm text-gray-500">
          Ingen aktive butikker. Slå mindst én butik til under{" "}
          <Link href="/indstillinger" className="underline">
            Indstillinger
          </Link>{" "}
          først.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Manuel import</h1>
        <Link href="/tilbud" className="text-sm text-gray-500 underline">
          Tilbage til tilbud
        </Link>
      </div>

      <ManualTextImport stores={stores} />
      <ManualImageImport stores={stores} />
      <ManualOfferForm stores={stores} />
    </div>
  );
}
