import { CakeBuilderForm } from "@/components/cake-builder-form";

export default function CakeBuilderPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-[#2D1F16]">Custom Cake Builder</h1>
      <p className="max-w-2xl text-[#5f4637]">
        Build your perfect cake request with flavor, size, message, event date, and budget.
      </p>
      <CakeBuilderForm />
    </div>
  );
}

