import { CakeBuilderForm } from "@/components/cake-builder-form";

export default function CakeBuilderPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-foreground">Custom Cake Builder</h1>
      <p className="max-w-2xl text-muted">
        Build your perfect cake request with flavor, size, message, event date, and budget.
      </p>
      <CakeBuilderForm />
    </div>
  );
}
