import type { Metadata } from "next";
import { CakeBuilderForm } from "@/components/cake-builder-form";
import { getCakeBuilderData } from "@/lib/cakes-data";
import type { CakeConfig, CakePrice } from "@/types/cakes";

export const metadata: Metadata = {
  title: "Custom Cake Builder",
  description:
    "Build a custom cake request with live pricing, then send your preferred cake combination to KiRA Bakery.",
  alternates: {
    canonical: "/cake-builder",
  },
};

export default async function CakeBuilderPage() {
  let initialConfig: CakeConfig | null = null;
  let initialPrices: CakePrice[] = [];

  try {
    const cakeBuilderData = await getCakeBuilderData();
    initialConfig = cakeBuilderData.config;
    initialPrices = cakeBuilderData.prices;
  } catch (error) {
    console.error("cake_builder_page_data_failed", error instanceof Error ? error.message : "unknown");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-foreground">Custom Cake Builder</h1>
      <p className="max-w-2xl text-muted">
        Choose from our live cake pricing matrix, see the estimated price instantly, and send your
        request with the exact combination you want.
      </p>
      <CakeBuilderForm initialConfig={initialConfig} initialPrices={initialPrices} />
    </div>
  );
}
