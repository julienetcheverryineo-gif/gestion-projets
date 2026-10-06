import { lireTexteSap } from "./lireTexteSap";
// Accès au dossier où le gestionnaire SAP installé sur le poste dépose ses
// exports (%USERPROFILE%\PilotageSAP\exports). Le dossier est choisi une
// seule fois dans l'appli (File System Access API : Chrome / Edge) et sa
// référence est mémorisée dans IndexedDB ; le navigateur redemande
// simplement l'autorisation de lecture à chaque nouvelle session.

const NOM_BASE = "pilotage-sap";
const NOM_STORE = "handles";
const CLE = "dossier-exports";

export const dossierSupporte = () =>
  typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

function ouvrirBase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOM_BASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(NOM_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function lireMemoire() {
  try {
    const base = await ouvrirBase();
    return await new Promise((resolve) => {
      const r = base.transaction(NOM_STORE).objectStore(NOM_STORE).get(CLE);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function ecrireMemoire(handle) {
  try {
    const base = await ouvrirBase();
    await new Promise((resolve) => {
      const tx = base.transaction(NOM_STORE, "readwrite");
      tx.objectStore(NOM_STORE).put(handle, CLE);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {
    /* stockage indisponible : le dossier sera redemandé */
  }
}

export const lireDossierMemorise = () => lireMemoire();

export async function choisirDossier() {
  const handle = await window.showDirectoryPicker({ id: "pilotage-sap-exports", mode: "readwrite" });
  await ecrireMemoire(handle);
  return handle;
}

// À appeler depuis un clic (le navigateur exige un geste de l'utilisateur
// pour redemander l'autorisation).
export async function autoriser(handle) {
  const options = { mode: "read" };
  if ((await handle.queryPermission(options)) === "granted") return true;
  return (await handle.requestPermission(options)) === "granted";
}

// Contenu d'un fichier du dossier, ou null s'il n'existe pas.
export async function lireFichier(handle, nom) {
  try {
    const fh = await handle.getFileHandle(nom);
    const fichier = await fh.getFile();
    return { texte: await lireTexteSap(fichier), modifieLe: fichier.lastModified, taille: fichier.size };
  } catch {
    return null;
  }
}

// Ouvre le lien ineo-sap:// sans quitter la page.
export function ouvrirLien(url) {
  const a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
