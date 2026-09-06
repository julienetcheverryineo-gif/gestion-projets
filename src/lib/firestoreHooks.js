import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebase";

// Petit hook générique : écoute une collection en temps réel
export function useCollection(nomCollection, champTri = "creeLe") {
  const [documents, setDocuments] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    const q = query(collection(db, nomCollection), orderBy(champTri, "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setDocuments(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
        setChargement(false);
      },
      () => setChargement(false)
    );
    return unsubscribe;
  }, [nomCollection, champTri]);

  return { documents, chargement };
}
