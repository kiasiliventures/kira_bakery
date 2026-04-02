const LOCALHOST_SITE_URL = "http://localhost:3000";

function normalizeSiteUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

export function getSiteUrl() {
  const envCandidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];

  for (const candidate of envCandidates) {
    const normalized = normalizeSiteUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return new URL(LOCALHOST_SITE_URL);
}

export function getAbsoluteUrl(pathname = "/") {
  return new URL(pathname, getSiteUrl()).toString();
}
