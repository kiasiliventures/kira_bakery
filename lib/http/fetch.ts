import "server-only";

type FetchWithTimeoutOptions = {
  operationName: string;
  timeoutMs: number;
};

function mergeSignals(...signals: Array<AbortSignal | null | undefined>) {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length === 0) {
    return undefined;
  }

  if (activeSignals.length === 1) {
    return activeSignals[0];
  }

  return AbortSignal.any(activeSignals);
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  options: FetchWithTimeoutOptions,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: mergeSignals(init.signal, timeoutSignal),
    });
  } catch (error) {
    if (timeoutSignal.aborted && !init.signal?.aborted) {
      throw new Error(
        `${options.operationName} timed out after ${options.timeoutMs}ms.`,
      );
    }

    throw error;
  }
}
