import { initializeApp, getApps } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app);
export const storage = getStorage(app);

// Persistance de session plutôt que persistance locale (par défaut) :
// la connexion ne survit qu'à l'onglet/l'application ouverte. Fermer
// complètement le navigateur ou l'appli (PWA) déconnecte l'utilisateur —
// il devra ressaisir ses identifiants à la prochaine ouverture. Appelé
// avant tout login (au chargement du module), donc sans risque de
// course avec un login déclenché juste après.
setPersistence(auth, browserSessionPersistence).catch(() => {});

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

// À remplacer par la vraie clé, disponible dans la console Firebase :
// Paramètres du projet > Cloud Messaging > Certificats Web Push >
// "Générer une paire de clés".
export const VAPID_KEY = "REMPLACER_PAR_VOTRE_CLE_VAPID";
