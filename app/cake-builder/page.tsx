import { CakeBuilderForm } from "@/components/cake-builder-form";

export default function CakeBuilderPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-foreground">Custom Cake Builder</h1>
      <p className="max-w-2xl text-muted">
        Choose from our live cake pricing matrix, see the estimated price instantly, and send your
        request with the exact combination you want.
      </p>
      <CakeBuilderForm />
    </div>
  );
}
