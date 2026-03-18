const SHELL_CACHE_NAME = "kira-shell-v2";
const RUNTIME_CACHE_NAME = "kira-runtime-v2";
const IMAGE_CACHE_NAME = "kira-images-v2";
const CACHE_NAMES = [SHELL_CACHE_NAME, RUNTIME_CACHE_NAME, IMAGE_CACHE_NAME];
const STATIC_PATHS = [
  "/",
  "/menu",
  "/classes",
  "/contact",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/images/hero_image.png",
];

async function cacheSuccessfulResponse(cacheName, request, response) {
  if (!response || (!response.ok && response.type !== "opaque")) {
    return response;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkResponsePromise = fetch(request)
    .then((response) => cacheSuccessfulResponse(cacheName, request, response))
    .catch(() => null);

  if (cached) {
    void networkResponsePromise;
    return cached;
  }

  const networkResponse = await networkResponsePromise;
  if (networkResponse) {
    return networkResponse;
  }

  throw new Error("Unable to fulfill request from cache or network.");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => cache.addAll(STATIC_PATHS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !CACHE_NAMES.includes(key))
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.pathname.startsWith("/api")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => cacheSuccessfulResponse(SHELL_CACHE_NAME, request, response))
        .catch(async () => {
          const shellCache = await caches.open(SHELL_CACHE_NAME);
          const cached = await shellCache.match(request);
          return cached || shellCache.match("/offline");
        }),
    );
    return;
  }

  if (request.destination === "image") {
    event.respondWith(
      staleWhileRevalidate(IMAGE_CACHE_NAME, request),
    );
    return;
  }

  if (
    ["style", "script", "font"].includes(request.destination)
    || url.pathname.startsWith("/_next/static")
  ) {
    event.respondWith(staleWhileRevalidate(RUNTIME_CACHE_NAME, request));
  }
});
