import { useSyncExternalStore } from "react";
import { clearIndexedDbPersistence, terminate, waitForPendingWrites } from "firebase/firestore";
import { db } from "../firebase";

// Mode hors-ligne : état de la connexion, écritures en attente d'envoi,
// date de dernière synchronisation, enregistrement du service worker.
// Les données elles-mêmes sont gardées par le cache persistant de Firestore
// (voir firebase.js) ; les modifications faites sans réseau y sont mises en
// file d'attente et envoyées automatiquement au retour de la connexion.

const CLE_SYNCHRO = "derniereSynchro";

let etat = {
  enLigne: typeof navigator === "undefined" ? true : navigator.onLine,
  enAttente: 0,
  derniereSynchro: lireSynchro(),
};
const abonnes = new Set();
function emettre(patch) {
  etat = { ...etat, ...patch };
  abonnes.forEach((f) => f());
}
function lireSynchro() {
  try {
    return Number(localStorage.getItem(CLE_SYNCHRO)) || 0;
  } catch {
    return 0;
  }
}

// Une écriture Firestore ne se termine qu'une fois reçue par le serveur : tant
// que le téléphone est hors ligne elle reste « en attente » (mais l'écran est
// déjà à jour grâce au cache local). Ce compteur sert à l'indicateur.
let enAttenteSession = 0;
let enAttenteDemarrage = false;
export function suivreEcriture(promesse) {
  enAttenteSession += 1;
  emettre({ enAttente: enAttenteSession + (enAttenteDemarrage ? 1 : 0) });
  const fin = () => {
    enAttenteSession = Math.max(0, enAttenteSession - 1);
    emettre({ enAttente: enAttenteSession + (enAttenteDemarrage ? 1 : 0) });
  };
  Promise.resolve(promesse).then(fin, fin);
  return promesse;
}

let derniereNote = 0;
export function noterSynchro() {
  const maintenant = Date.now();
  if (maintenant - derniereNote < 5000) return;
  derniereNote = maintenant;
  try {
    localStorage.setItem(CLE_SYNCHRO, String(maintenant));
  } catch {
    // stockage indisponible
  }
  emettre({ derniereSynchro: maintenant });
}

// navigator.onLine dit seulement s'il y a un réseau (Wi-Fi sans internet = « en
// ligne ») : on le complète par un petit sondage du site.
async function sonder() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (etat.enLigne) emettre({ enLigne: false });
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const rep = await fetch("/manifest.json?__ping=" + Date.now(), { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    if (rep.ok !== etat.enLigne) emettre({ enLigne: rep.ok });
  } catch {
    if (etat.enLigne) emettre({ enLigne: false });
  }
}

let demarre = false;
export function demarrerSuiviConnexion() {
  if (demarre || typeof window === "undefined") return;
  demarre = true;
  window.addEventListener("online", sonder);
  window.addEventListener("offline", () => emettre({ enLigne: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sonder();
  });
  setInterval(() => {
    if (document.visibilityState === "visible") sonder();
  }, 20000);
  sonder();
  // Écritures restées en attente d'une session précédente (appli fermée hors ligne).
  const timer = setTimeout(() => {
    enAttenteDemarrage = true;
    emettre({ enAttente: enAttenteSession + 1 });
  }, 1200);
  waitForPendingWrites(db)
    .catch(() => {})
    .finally(() => {
      clearTimeout(timer);
      enAttenteDemarrage = false;
      emettre({ enAttente: enAttenteSession });
    });
}

export function useEtatSynchro() {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => etat
  );
}

// Service worker : coque de l'appli en cache pour démarrer sans réseau.
export function enregistrerServiceWorker() {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const utiles = new Set();
      document.querySelectorAll("script[src], link[rel=stylesheet][href]").forEach((n) => {
        const u = new URL(n.src || n.href, location.href);
        if (u.origin === location.origin && u.pathname.startsWith("/assets/")) utiles.add(u.href);
      });
      performance.getEntriesByType("resource").forEach((r) => {
        const u = new URL(r.name);
        if (u.origin === location.origin && u.pathname.startsWith("/assets/")) utiles.add(u.href);
      });
      (navigator.serviceWorker.controller || reg.active)?.postMessage({ type: "PRECACHE", urls: [...utiles] });
    } catch {
      // service worker indisponible : l'appli fonctionne simplement en ligne
    }
  });
}

// Déconnexion « propre » : le cache local contient les données du compte, on
// le vide à la déconnexion (appareil partagé). S'il reste des modifications
// non envoyées, on prévient avant de les perdre.
export async function viderCacheLocal() {
  try {
    const enAttente = await Promise.race([
      waitForPendingWrites(db).then(() => false),
      new Promise((r) => setTimeout(() => r(true), 1500)),
    ]);
    if (enAttente && !window.confirm("Des modifications faites hors ligne ne sont pas encore envoyées. Se déconnecter les fera perdre. Se déconnecter quand même ?")) {
      return false;
    }
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // best-effort
  }
  return true;
}
