import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { addDoc, collection, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, appliquerResterConnecte } from "../firebase";
import { viderCacheLocal } from "../lib/offline";
import { mettreAJourPastilleAppli } from "../lib/push";

const AuthContext = createContext(null);

// Copie du profil sur l'appareil, pour pouvoir ouvrir l'appli sans réseau.
const CLE_PROFIL = "profilLocal";
function garderProfilLocal(id, donnees) {
  try {
    const { creeLe: _creeLe, ...propre } = donnees;
    localStorage.setItem(CLE_PROFIL, JSON.stringify({ id, ...propre }));
  } catch {
    // stockage indisponible
  }
}
function lireProfilLocal(uid) {
  try {
    const p = JSON.parse(localStorage.getItem(CLE_PROFIL) || "null");
    return p && p.id === uid ? p : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // objet Firebase Auth
  const [profile, setProfile] = useState(null); // document Firestore (rôle, équipe...)
  const [loading, setLoading] = useState(true);
  const [compteDesactive, setCompteDesactive] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const ref = doc(db, "users", firebaseUser.uid);
        let snap;
        try {
          snap = await getDoc(ref);
        } catch {
          // Hors ligne et profil absent du cache Firestore : on reprend la
          // dernière copie du profil gardée sur l'appareil (mode avion).
          const copie = lireProfilLocal(firebaseUser.uid);
          if (copie) {
            setUser(firebaseUser);
            setProfile(copie);
          } else {
            setUser(null);
            setProfile(null);
          }
          setLoading(false);
          return;
        }
        if (snap.exists()) {
          const donnees = snap.data();
          if (donnees.actif === false) {
            // Compte désactivé par un admin : déconnexion immédiate, pas d'accès.
            setCompteDesactive(true);
            await signOut(auth);
            setUser(null);
            setProfile(null);
            setLoading(false);
            return;
          }
          setUser(firebaseUser);
          setProfile({ id: snap.id, ...donnees });
          garderProfilLocal(snap.id, donnees);
        } else {
          // Premier login : on crée un profil par défaut avec le rôle "automaticien"
          const defaultProfile = {
            email: firebaseUser.email,
            nom: firebaseUser.email.split("@")[0],
            role: "automaticien",
            actif: true,
            creeLe: serverTimestamp(),
          };
          await setDoc(ref, defaultProfile);
          setUser(firebaseUser);
          setProfile({ id: firebaseUser.uid, ...defaultProfile });
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email, password, resterConnecte) => {
    setCompteDesactive(false);
    if (typeof resterConnecte === "boolean") await appliquerResterConnecte(resterConnecte);
    const identifiants = await signInWithEmailAndPassword(auth, email, password);
    // Journalisation de la connexion (pour les statistiques d'usage côté
    // admin) : best-effort, ne doit jamais bloquer la connexion elle-même.
    try {
      await addDoc(collection(db, "connexions"), {
        userId: identifiants.user.uid,
        email: identifiants.user.email,
        horodatage: serverTimestamp(),
      });
    } catch (err) {
      console.error("Erreur journalisation de la connexion:", err);
    }
    return identifiants;
  };

  // Vide la pastille de l'icône avant de couper la session : sinon elle
  // resterait affichée (avec le compte du dernier utilisateur) jusqu'à ce
  // qu'un autre compte se connecte et la remette à jour.
  const logout = async () => {
    mettreAJourPastilleAppli(0);
    // Le cache hors-ligne contient les données du compte : on le vide (après
    // avoir vérifié qu'aucune modification n'attend d'être envoyée).
    if (!(await viderCacheLocal())) return new Promise(() => {});
    try {
      localStorage.removeItem(CLE_PROFIL);
    } catch {
      // stockage indisponible
    }
    await signOut(auth);
    window.location.assign("/connexion");
    return new Promise(() => {});
  };

  const isChefDeProjet = profile?.role === "chef_de_projet";
  const isAdmin = profile?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        login,
        logout,
        isChefDeProjet,
        isAdmin,
        compteDesactive,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
