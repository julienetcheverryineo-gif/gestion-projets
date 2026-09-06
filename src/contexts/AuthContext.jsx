import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // objet Firebase Auth
  const [profile, setProfile] = useState(null); // document Firestore (rôle, équipe...)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const ref = doc(db, "users", firebaseUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setProfile({ id: snap.id, ...snap.data() });
        } else {
          // Premier login : on crée un profil par défaut avec le rôle "technicien"
          const defaultProfile = {
            email: firebaseUser.email,
            nom: firebaseUser.email.split("@")[0],
            role: "technicien",
            creeLe: serverTimestamp(),
          };
          await setDoc(ref, defaultProfile);
          setProfile({ id: firebaseUser.uid, ...defaultProfile });
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const logout = () => signOut(auth);

  const isChefDeProjet = profile?.role === "chef_de_projet";
  const isAdmin = profile?.role === "admin";

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, login, logout, isChefDeProjet, isAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
