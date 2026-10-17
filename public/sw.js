// Service worker de l'appli (mode hors-ligne).
//  - Coque de l'appli : index.html servi réseau d'abord (toujours la dernière
//    version quand on est en ligne), sinon la copie en cache.
//  - Fichiers /assets/* (nom hashé, immuables) : cache d'abord.
//  - Polices Google : cache avec revalidation.
//  - Données : gérées par Firestore (cache IndexedDB), pas ici.
// (Les notifications push ont leur propre worker : firebase-messaging-sw.js.)
const VERSION = "v1";
const CACHE_COQUE = "coque-" + VERSION;
const CACHE_ASSETS = "assets-" + VERSION;
const CACHE_POLICES = "polices-" + VERSION;
const COQUE = ["/", "/manifest.json", "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_COQUE)
      .then((c) => c.addAll(COQUE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms
            .filter((n) => ![CACHE_COQUE, CACHE_ASSETS, CACHE_POLICES].includes(n))
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

// La page envoie la liste des fichiers qu'elle utilise : on les met en cache
// pour que l'appli démarre hors ligne dès la première visite, et on retire
// du cache les anciens fichiers qui ne sont plus utilisés.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "PRECACHE" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_ASSETS);
      const utiles = new Set(data.urls);
      await Promise.all(
        data.urls.map(async (url) => {
          if (await cache.match(url)) return;
          try {
            const rep = await fetch(url, { cache: "reload" });
            if (rep.ok) await cache.put(url, rep);
          } catch {
            // hors ligne : on réessaiera à la prochaine ouverture
          }
        })
      );
      if (utiles.size > 0) {
        const cles = await cache.keys();
        await Promise.all(cles.filter((r) => !utiles.has(r.url)).map((r) => cache.delete(r)));
      }
    })()
  );
});

async function reseauPuisCache(requete, nomCache, cleCache) {
  const cache = await caches.open(nomCache);
  try {
    const rep = await fetch(requete);
    if (rep.ok) cache.put(cleCache || requete, rep.clone());
    return rep;
  } catch (err) {
    const copie = await cache.match(cleCache || requete);
    if (copie) return copie;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);

  // Sondage de connexion de la page : toujours le vrai réseau.
  if (url.searchParams.has("__ping")) return;

  // Polices Google : cache d'abord, mise à jour en arrière-plan.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(CACHE_POLICES).then(async (cache) => {
        const copie = await cache.match(requete);
        const maj = fetch(requete)
          .then((rep) => {
            if (rep.ok || rep.type === "opaque") cache.put(requete, rep.clone());
            return rep;
          })
          .catch(() => copie);
        return copie || maj;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Pages (navigation) : réseau d'abord, sinon la coque en cache.
  if (requete.mode === "navigate") {
    event.respondWith(
      reseauPuisCache(requete, CACHE_COQUE, "/").catch(
        () => new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
      )
    );
    return;
  }

  // Fichiers hashés : cache d'abord.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(CACHE_ASSETS).then(async (cache) => {
        const copie = await cache.match(requete);
        if (copie) return copie;
        const rep = await fetch(requete);
        if (rep.ok) cache.put(requete, rep.clone());
        return rep;
      })
    );
    return;
  }

  // Icônes, manifeste... : réseau d'abord, sinon cache.
  if (COQUE.includes(url.pathname) || /\.(png|svg|ico|json|webmanifest)$/.test(url.pathname)) {
    event.respondWith(reseauPuisCache(requete, CACHE_COQUE));
  }
});
