"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cakeRequestSchema,
  cakeSelectionFields,
  getDistinctIds,
  matchesCakeSelection,
} from "@/lib/cakes";
import { formatUGX } from "@/lib/format";
import type {
  CakeConfig,
  CakeCustomRequestPayload,
  CakePrice,
  CakeSelection,
} from "@/types/cakes";

type BuilderState = CakeSelection & {
  customerName: string;
  phone: string;
  email: string;
  eventDate: string;
  messageOnCake: string;
  notes: string;
};

type FieldName = keyof CakeSelection;

const emptyState: BuilderState = {
  flavourId: "",
  shapeId: "",
  sizeId: "",
  tierOptionId: "",
  toppingId: "",
  customerName: "",
  phone: "",
  email: "",
  eventDate: "",
  messageOnCake: "",
  notes: "",
};

export function CakeBuilderForm() {
  const [config, setConfig] = useState<CakeConfig | null>(null);
  const [prices, setPrices] = useState<CakePrice[]>([]);
  const [form, setForm] = useState<BuilderState>(emptyState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "idle" | "success" | "error"; text: string }>({
    tone: "idle",
    text: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setStatus({ tone: "idle", text: "" });

      try {
        const [configResponse, pricesResponse] = await Promise.all([
          fetch("/api/cakes/config", { cache: "no-store" }),
          fetch("/api/cakes/prices", { cache: "no-store" }),
        ]);

        const configPayload = (await configResponse.json().catch(() => null)) as
          | { config?: CakeConfig; message?: string }
          | null;
        const pricesPayload = (await pricesResponse.json().catch(() => null)) as
          | { prices?: CakePrice[]; message?: string }
          | null;

        if (!configResponse.ok) {
          throw new Error(configPayload?.message ?? "Unable to load cake options.");
        }

        if (!pricesResponse.ok) {
          throw new Error(pricesPayload?.message ?? "Unable to load cake prices.");
        }

        if (cancelled) {
          return;
        }

        setConfig(configPayload?.config ?? null);
        setPrices(pricesPayload?.prices ?? []);
      } catch (error) {
        if (!cancelled) {
          setStatus({
            tone: "error",
            text: error instanceof Error ? error.message : "Unable to load cake builder.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const getAvailableIdsForField = (selection: BuilderState, field: FieldName) => {
    const scopedSelection: Partial<CakeSelection> = {};

    for (const candidateField of cakeSelectionFields) {
      if (candidateField === field) {
        break;
      }

      scopedSelection[candidateField] = selection[candidateField];
    }

    return getDistinctIds(prices, scopedSelection, field);
  };

  const selectionKey = [
    form.shapeId,
    form.sizeId,
    form.tierOptionId,
    form.toppingId,
    form.flavourId,
  ].join("|");

  useEffect(() => {
    if (prices.length === 0) {
      return;
    }

    setForm((current) => {
      let next = current;
      let changed = false;

      for (const field of cakeSelectionFields) {
        const available = getAvailableIdsForField(next, field);
        if (available.length === 0) {
          continue;
        }

        if (!available.includes(next[field])) {
          if (!changed) {
            next = { ...current };
            changed = true;
          }

          next[field] = available[0];
        }
      }

      return changed ? next : current;
    });
  }, [prices, selectionKey]);

  const selectedPrice = useMemo(
    () =>
      prices.find((price) =>
        matchesCakeSelection(price, {
          flavourId: form.flavourId,
          shapeId: form.shapeId,
          sizeId: form.sizeId,
          tierOptionId: form.tierOptionId,
          toppingId: form.toppingId,
        }),
      ) ?? null,
    [form.flavourId, form.shapeId, form.sizeId, form.tierOptionId, form.toppingId, prices],
  );

  const availableIds = useMemo(
    () => ({
      shapeId: getAvailableIdsForField(form, "shapeId"),
      sizeId: getAvailableIdsForField(form, "sizeId"),
      tierOptionId: getAvailableIdsForField(form, "tierOptionId"),
      toppingId: getAvailableIdsForField(form, "toppingId"),
      flavourId: getAvailableIdsForField(form, "flavourId"),
    }),
    [form, prices],
  );

  const availableOptions = useMemo(() => {
    if (!config) {
      return null;
    }

    return {
      shapes: config.shapes.filter((option) => availableIds.shapeId.includes(option.id)),
      sizes: config.sizes.filter((option) => availableIds.sizeId.includes(option.id)),
      tierOptions: config.tierOptions.filter((option) => availableIds.tierOptionId.includes(option.id)),
      toppings: config.toppings.filter((option) => availableIds.toppingId.includes(option.id)),
      flavours: config.flavours.filter((option) => availableIds.flavourId.includes(option.id)),
    };
  }, [availableIds, config]);

  const handleSelectionChange = (field: FieldName, value: string) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      const changedIndex = cakeSelectionFields.indexOf(field);

      for (const dependentField of cakeSelectionFields.slice(changedIndex + 1)) {
        next[dependentField] = "";
      }

      return next;
    });
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const handleInputChange = (field: keyof BuilderState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedPrice) {
      setStatus({ tone: "error", text: "Select a valid cake combination first." });
      return;
    }

    const payload: CakeCustomRequestPayload = {
      customerName: form.customerName,
      phone: form.phone,
      email: form.email,
      eventDate: form.eventDate,
      messageOnCake: form.messageOnCake,
      notes: form.notes,
      priceId: selectedPrice.id,
      flavourId: form.flavourId,
      shapeId: form.shapeId,
      sizeId: form.sizeId,
      tierOptionId: form.tierOptionId,
      toppingId: form.toppingId,
    };

    const parsed = cakeRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        nextErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setStatus({ tone: "idle", text: "" });

    try {
      const response = await fetch("/api/cakes/custom-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const responsePayload = (await response.json().catch(() => null)) as
        | { ok?: boolean; requestId?: string; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(responsePayload?.message ?? "Unable to submit your cake request.");
      }

      setErrors({});
      setStatus({
        tone: "success",
        text: responsePayload?.requestId
          ? `Cake request received. Reference: ${responsePayload.requestId}`
          : "Cake request received.",
      });
      setForm((current) => ({
        ...current,
        customerName: "",
        phone: "",
        email: "",
        eventDate: "",
        messageOnCake: "",
        notes: "",
      }));
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to submit your cake request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Custom Cake Builder</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted">Loading cake options and prices...</p>
        </CardContent>
      </Card>
    );
  }

  if (!config || !availableOptions) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Custom Cake Builder</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-danger">{status.text || "Unable to load cake builder."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Build Your Cake</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="shapeId">Shape</Label>
            <Select id="shapeId" value={form.shapeId} onChange={(event) => handleSelectionChange("shapeId", event.target.value)}>
              {availableOptions.shapes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
            {errors.shapeId && <p className="text-xs text-danger">{errors.shapeId}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sizeId">Size</Label>
            <Select id="sizeId" value={form.sizeId} onChange={(event) => handleSelectionChange("sizeId", event.target.value)}>
              {availableOptions.sizes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
            {errors.sizeId && <p className="text-xs text-danger">{errors.sizeId}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tierOptionId">Tier Option</Label>
            <Select id="tierOptionId" value={form.tierOptionId} onChange={(event) => handleSelectionChange("tierOptionId", event.target.value)}>
              {availableOptions.tierOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
            {errors.tierOptionId && <p className="text-xs text-danger">{errors.tierOptionId}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="flavourId">Flavour</Label>
            <Select id="flavourId" value={form.flavourId} onChange={(event) => handleSelectionChange("flavourId", event.target.value)}>
              {availableOptions.flavours.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
            {errors.flavourId && <p className="text-xs text-danger">{errors.flavourId}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="toppingId">Finish</Label>
            <Select id="toppingId" value={form.toppingId} onChange={(event) => handleSelectionChange("toppingId", event.target.value)}>
              {availableOptions.toppings.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
            {errors.toppingId && <p className="text-xs text-danger">{errors.toppingId}</p>}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="messageOnCake">Message On Cake</Label>
            <Input
              id="messageOnCake"
              value={form.messageOnCake}
              onChange={(event) => handleInputChange("messageOnCake", event.target.value)}
              placeholder="Happy Birthday Sarah"
            />
            {errors.messageOnCake && <p className="text-xs text-danger">{errors.messageOnCake}</p>}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="eventDate">Needed For</Label>
            <Input
              id="eventDate"
              type="date"
              value={form.eventDate}
              onChange={(event) => handleInputChange("eventDate", event.target.value)}
            />
            {errors.eventDate && <p className="text-xs text-danger">{errors.eventDate}</p>}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Price Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selectedPrice ? (
              <>
                <div className="grid gap-2 text-muted">
                  <p>Shape: <span className="text-foreground">{selectedPrice.shapeName}</span></p>
                  <p>Size: <span className="text-foreground">{selectedPrice.sizeName}</span></p>
                  <p>Tier: <span className="text-foreground">{selectedPrice.tierOptionName}</span></p>
                  <p>Finish: <span className="text-foreground">{selectedPrice.toppingName}</span></p>
                  <p>Flavour: <span className="text-foreground">{selectedPrice.flavourName}</span></p>
                  <p>Estimated Weight: <span className="text-foreground">{selectedPrice.weightKg} kg</span></p>
                </div>
                <div className="rounded-2xl bg-surface-alt p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-badge-foreground">Estimated Price</p>
                  <p className="mt-2 font-serif text-3xl text-foreground">{formatUGX(selectedPrice.priceUgx)}</p>
                </div>
              </>
            ) : (
              <p className="text-muted">Choose a valid cake combination to see the live price.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Your Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customerName">Full Name</Label>
              <Input
                id="customerName"
                value={form.customerName}
                onChange={(event) => handleInputChange("customerName", event.target.value)}
                placeholder="Your name"
              />
              {errors.customerName && <p className="text-xs text-danger">{errors.customerName}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(event) => handleInputChange("phone", event.target.value)}
                placeholder="+256..."
              />
              {errors.phone && <p className="text-xs text-danger">{errors.phone}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => handleInputChange("email", event.target.value)}
                placeholder="you@example.com"
              />
              {errors.email && <p className="text-xs text-danger">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(event) => handleInputChange("notes", event.target.value)}
                placeholder="Colours, delivery notes, theme, or anything we should know."
              />
              {errors.notes && <p className="text-xs text-danger">{errors.notes}</p>}
            </div>

            {status.text ? (
              <p className={`text-sm ${status.tone === "error" ? "text-danger" : status.tone === "success" ? "text-badge-foreground" : "text-muted"}`}>
                {status.text}
              </p>
            ) : null}

            <Button className="w-full" disabled={!selectedPrice || isSubmitting}>
              {isSubmitting ? "Sending Request..." : "Send Cake Request"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-sm text-muted">
            Exact price is based on the current cake matrix. For highly custom decorations outside these
            combinations, our team may still contact you to confirm final details.
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
