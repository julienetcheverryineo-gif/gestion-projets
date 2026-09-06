import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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

// Analytics ne fonctionne pas dans tous les environnements (ex: iOS PWA en
// mode standalone) : on l'active seulement si le navigateur le supporte.
isSupported().then((supported) => {
  if (supported) getAnalytics(app);
});
