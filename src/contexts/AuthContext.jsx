import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { addDoc, collection, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // objet Firebase Auth
  const [profile, setProfile] = useState(null); // document Firestore (rôle, équipe...)
  const [loading, setLoading] = useState(true);
  const [compteDesactive, setCompteDesactive] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const ref = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(ref);
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

  const login = async (email, password) => {
    setCompteDesactive(false);
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

  const logout = () => signOut(auth);

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
