import { after } from "next/server";

export function runAfterResponse(task: () => Promise<void> | void) {
  try {
    after(task);
  } catch {
    // Route tests run outside Next's request scope, where `after()` is unavailable.
  }
}
