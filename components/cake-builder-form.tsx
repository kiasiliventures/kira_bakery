"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateId } from "@/lib/format";
import { getOrderRepository } from "@/lib/repository-provider";
import { cakeBuilderSchema, type CakeBuilderSchemaInput } from "@/lib/validation";
import type { Order } from "@/types/order";

export function CakeBuilderForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>("");

  const onSubmit = async (formData: FormData) => {
    const input: CakeBuilderSchemaInput = {
      flavor: String(formData.get("flavor") ?? ""),
      size: String(formData.get("size") ?? ""),
      message: String(formData.get("message") ?? ""),
      eventDate: String(formData.get("eventDate") ?? ""),
      budgetMin: Number(formData.get("budgetMin") ?? 0),
      budgetMax: Number(formData.get("budgetMax") ?? 0),
      referenceImageName:
        (formData.get("referenceImage") as File | null)?.name || undefined,
    };

    const result = cakeBuilderSchema.safeParse(input);
    if (!result.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        nextErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    const response = await fetch("/api/cake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    });
    if (!response.ok) {
      setStatus("Validation failed on server.");
      return;
    }

    const order: Order = {
      id: generateId("cake"),
      createdAt: new Date().toISOString(),
      items: [],
      status: "Pending",
      totalUGX: result.data.budgetMax,
      customer: {
        customerName: "Guest Cake Request",
        phone: "+256000000000",
        address: "Kira",
        deliveryDate: result.data.eventDate,
      },
      cakeRequest: result.data,
    };
    const orderRepository = getOrderRepository();
    await orderRepository.create(order);
    setErrors({});
    setStatus("Cake request saved in local DEV mode.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-2xl">Custom Cake Builder</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="flavor">Flavor</Label>
            <Select id="flavor" name="flavor" defaultValue="">
              <option value="" disabled>
                Select flavor
              </option>
              <option value="Vanilla">Vanilla</option>
              <option value="Chocolate">Chocolate</option>
              <option value="Red Velvet">Red Velvet</option>
              <option value="Lemon">Lemon</option>
            </Select>
            {errors.flavor && <p className="text-xs text-[#8f2a2a]">{errors.flavor}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="size">Size</Label>
            <Select id="size" name="size" defaultValue="">
              <option value="" disabled>
                Select size
              </option>
              <option value="1kg">1kg</option>
              <option value="2kg">2kg</option>
              <option value="3kg">3kg</option>
            </Select>
            {errors.size && <p className="text-xs text-[#8f2a2a]">{errors.size}</p>}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="message">Cake Message</Label>
            <Textarea id="message" name="message" placeholder="Happy Birthday Amina!" />
            {errors.message && <p className="text-xs text-[#8f2a2a]">{errors.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="eventDate">Event Date</Label>
            <Input id="eventDate" name="eventDate" type="date" />
            {errors.eventDate && <p className="text-xs text-[#8f2a2a]">{errors.eventDate}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="referenceImage">Reference Image Upload</Label>
            <Input id="referenceImage" name="referenceImage" type="file" accept="image/*" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budgetMin">Budget Min (UGX)</Label>
            <Input id="budgetMin" name="budgetMin" type="number" min={50000} />
            {errors.budgetMin && <p className="text-xs text-[#8f2a2a]">{errors.budgetMin}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="budgetMax">Budget Max (UGX)</Label>
            <Input id="budgetMax" name="budgetMax" type="number" min={60000} />
            {errors.budgetMax && <p className="text-xs text-[#8f2a2a]">{errors.budgetMax}</p>}
          </div>
          <div className="md:col-span-2">
            <Button>Submit Cake Request</Button>
          </div>
          {status && <p className="text-sm text-[#5f4637] md:col-span-2">{status}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

