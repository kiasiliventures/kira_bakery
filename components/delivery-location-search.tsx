"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDistanceKm, formatUGX } from "@/lib/format";
import type {
  DeliveryAutocompleteSuggestion,
  DeliveryQuote,
  DeliveryResolvedLocation,
} from "@/lib/delivery/types";

type DeliveryLocationSearchProps = {
  validationMessage?: string;
  onLocationResolved: (location: DeliveryResolvedLocation | null) => void;
  onQuoteResolved: (quote: DeliveryQuote | null) => void;
  onQuotePendingChange: (isPending: boolean) => void;
};

export function DeliveryLocationSearch({
  validationMessage,
  onLocationResolved,
  onQuoteResolved,
  onQuotePendingChange,
}: DeliveryLocationSearchProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DeliveryAutocompleteSuggestion[]>([]);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sessionTokenRef = useRef<string>(crypto.randomUUID());
  const suppressNextSearchRef = useRef(false);
  const activeQuoteRequestRef = useRef(0);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setSuggestions([]);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }

    if (trimmedQuery.length < 3) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const searchParams = new URLSearchParams({
          input: trimmedQuery,
          sessionToken: sessionTokenRef.current,
        });
        const response = await fetch(`/api/delivery/autocomplete?${searchParams.toString()}`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              message?: string;
              suggestions?: DeliveryAutocompleteSuggestion[];
            }
          | null;

        if (!response.ok) {
          setSuggestions([]);
          setError(payload?.message ?? "Unable to search delivery locations right now.");
          return;
        }

        setSuggestions(payload?.suggestions ?? []);
      } catch (fetchError) {
        if (!(fetchError instanceof DOMException && fetchError.name === "AbortError")) {
          setSuggestions([]);
          setError("Unable to search delivery locations right now.");
        }
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  function resetResolvedState(nextQuery: string) {
    activeQuoteRequestRef.current += 1;
    setQuery(nextQuery);
    setQuote(null);
    setError(null);
    setIsQuoting(false);
    onLocationResolved(null);
    onQuoteResolved(null);
    onQuotePendingChange(false);
  }

  async function handleSuggestionSelect(suggestion: DeliveryAutocompleteSuggestion) {
    const requestId = activeQuoteRequestRef.current + 1;
    activeQuoteRequestRef.current = requestId;
    suppressNextSearchRef.current = true;
    setQuery(suggestion.fullText);
    setSuggestions([]);
    setError(null);
    setIsQuoting(true);
    onQuotePendingChange(true);

    try {
      const response = await fetch("/api/delivery/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId: suggestion.placeId,
          addressText: suggestion.fullText,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            message?: string;
            quote?: DeliveryQuote;
          }
        | null;

      if (!response.ok || !payload?.quote) {
        if (activeQuoteRequestRef.current !== requestId) {
          return;
        }
        setQuote(null);
        onLocationResolved(null);
        onQuoteResolved(null);
        setError(payload?.message ?? "Unable to quote delivery for that location.");
        return;
      }

      if (activeQuoteRequestRef.current !== requestId) {
        return;
      }

      setQuote(payload.quote);
      onLocationResolved(payload.quote.destination);
      onQuoteResolved(payload.quote);
      sessionTokenRef.current = crypto.randomUUID();
    } catch {
      if (activeQuoteRequestRef.current !== requestId) {
        return;
      }
      setQuote(null);
      onLocationResolved(null);
      onQuoteResolved(null);
      setError("Unable to quote delivery for that location.");
    } finally {
      if (activeQuoteRequestRef.current !== requestId) {
        return;
      }
      setIsQuoting(false);
      onQuotePendingChange(false);
    }
  }

  return (
    <div ref={containerRef} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="delivery-location-search">Delivery Address</Label>
        <div className="relative">
          <Input
            id="delivery-location-search"
            name="delivery-location-search"
            value={query}
            placeholder="Search for your delivery location"
            autoComplete="off"
            onChange={(event) => resetResolvedState(event.target.value)}
            className="pr-10"
          />
          {(isSearching || isQuoting) && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
          )}
        </div>
        <p className="text-xs text-muted">
          Search by place name, road, estate, or landmark, then pick one verified result.
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
          <ul className="divide-y divide-border">
            {suggestions.map((suggestion) => (
              <li key={suggestion.placeId}>
                <button
                  type="button"
                  onClick={() => handleSuggestionSelect(suggestion)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {suggestion.primaryText}
                    </span>
                    {suggestion.secondaryText && (
                      <span className="block truncate text-xs text-muted">
                        {suggestion.secondaryText}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {quote && (
        <div className="rounded-2xl border border-border bg-surface-alt p-4 text-sm">
          <p className="font-medium text-foreground">Selected address</p>
          <p className="mt-1 text-muted">{quote.destination.addressText}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface px-3 py-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Distance</p>
              <p className="mt-1 font-semibold text-foreground">
                {formatDistanceKm(quote.distanceKm)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface px-3 py-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Delivery Fee</p>
              <p className="mt-1 font-semibold text-foreground">
                {formatUGX(quote.deliveryFee)}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
      {validationMessage && <p className="text-xs text-danger">{validationMessage}</p>}
    </div>
  );
}
