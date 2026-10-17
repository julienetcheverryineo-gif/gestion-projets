import { initializeApp, getApps } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence, browserLocalPersistence } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported as isMessagingSupported } from "firebase/messaging";
import { getAnalytics, isSupported } from "firebase/analytics";

// Config du projet Firebase "appli-service".
// Ces valeurs ne sont pas secrètes : elles sont conçues pour être publiques
// (visibles dans le code envoyé au navigateur). La sécurité des données est
// assurée par les règles Firestore (firestore.rules), pas par cette config.
const firebaseConfig = {
  apiKey: "AIzaSyDuozvx5NXByHVCjVkE1lAddQj8aAcXCZw",
  authDomain: "appli-service.firebaseapp.com",
  projectId: "appli-service",
  storageBucket: "appli-service.firebasestorage.app",
  messagingSenderId: "195686796877",
  appId: "1:195686796877:web:6b8677b3748b3f485f9604",
  measurementId: "G-H8GMWP38QV",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Cache local persistant (IndexedDB) : l'appli s'ouvre et se consulte sans
// réseau (mode avion, sous-sol, gaines...). Les modifications faites hors
// ligne sont mises en file d'attente et envoyées toutes seules au retour du
// réseau. Multi-onglets pour que la PWA et un onglet navigateur partagent
// le même cache. En cas d'échec (navigation privée, vieux navigateur) on
// retombe sur le fonctionnement classique, en ligne uniquement.
function ouvrirFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      }),
    });
  } catch {
    return getFirestore(app);
  }
}
export const db = ouvrirFirestore();
export const storage = getStorage(app);

// Persistance de la connexion. Par défaut : persistance de session (la
// connexion ne survit qu'à l'onglet/l'application ouverte ; fermer
// complètement le navigateur ou la PWA déconnecte). Si l'utilisateur coche
// « Rester connecté sur cet appareil » à la connexion (nécessaire pour le
// mode hors-ligne : sans réseau on ne peut pas se reconnecter), la
// connexion est conservée sur l'appareil. Le choix est mémorisé ici.
const CLE_RESTER_CONNECTE = "resterConnecte";
export function lireResterConnecte() {
  try {
    const v = localStorage.getItem(CLE_RESTER_CONNECTE);
    if (v === null) {
      // Premier lancement : activé par défaut sur téléphone/tablette (usage
      // terrain), désactivé sur poste fixe comme avant.
      return typeof window !== "undefined" && window.matchMedia?.("(max-width: 860px) and (pointer: coarse)").matches;
    }
    return v === "1";
  } catch {
    return false;
  }
}
export function appliquerResterConnecte(valeur) {
  try {
    localStorage.setItem(CLE_RESTER_CONNECTE, valeur ? "1" : "0");
  } catch {
    // stockage indisponible : le choix ne sera juste pas mémorisé
  }
  return setPersistence(auth, valeur ? browserLocalPersistence : browserSessionPersistence);
}
setPersistence(auth, lireResterConnecte() ? browserLocalPersistence : browserSessionPersistence).catch(() => {});

// Analytics ne fonctionne pas dans tous les environnements (ex: iOS PWA en
// mode standalone) : on l'active seulement si le navigateur le supporte.
isSupported().then((supported) => {
  if (supported) getAnalytics(app);
});

// Instance Firebase secondaire, utilisée uniquement pour créer un nouveau
// compte utilisateur (Authentication) sans déconnecter la session de la
// personne qui fait la création (un admin par exemple). Sans ça,
// createUserWithEmailAndPassword connecterait automatiquement le nouveau
// compte à la place du compte courant.
export function getSecondaryAuth() {
  const nom = "secondaire";
  const appSecondaire = getApps().find((a) => a.name === nom) ?? initializeApp(firebaseConfig, nom);
  return getAuth(appSecondaire);
}

// Notifications push (Firebase Cloud Messaging) : pas supporté partout
// (ex: anciens Safari), donc toujours vérifier avant utilisation.
export async function getMessagingSafe() {
  if (await isMessagingSupported()) {
    return getMessaging(app);
  }
  return null;
}

// Clé disponible dans la console Firebase : Paramètres du projet >
// Cloud Messaging > Certificats Web Push > "Générer une paire de clés".
export const VAPID_KEY = "BG_F3V1PD-noAWFWsfzX6Y3DvtkEpP9g3ZGjHsK87cijo3wwlrbrxiTEc-zikSjc5gEEN1QQV8gmHCJH39fFJNQ";
