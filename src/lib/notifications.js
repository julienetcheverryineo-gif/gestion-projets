import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

// Types connus (doivent correspondre à la liste autorisée par
// firestore.rules, collection "notifications").
export const TYPE_RESERVE_CLIENT = "reserve_client";
export const TYPE_TACHE_RETARD = "tache_retard";
export const TYPE_TACHE_ASSIGNEE = "tache_assignee";

// Crée une notification pour `destinataireId`. Best-effort : une erreur ici
// (ex: règles, hors-ligne) ne doit jamais faire échouer l'action principale
// (création de réserve, affectation de tâche...) qui la déclenche.
export async function creerNotification({ destinataireId, type, titre, message, lien }) {
  if (!destinataireId) return;
  try {
    await addDoc(collection(db, "notifications"), {
      destinataireId,
      type,
      titre,
      message: message || null,
      lien: lien || null,
      lu: false,
      creeLe: serverTimestamp(),
    });
  } catch (err) {
    console.error("Erreur création de notification:", err);
  }
}

// Variante idempotente : n'écrit qu'une seule fois pour un `id` déterministe
// donné (ex: "retard-<tacheId>-<destinataireId>"), pour éviter qu'un même
// événement ne reparte en notification à chaque fois qu'on le détecte à
// nouveau côté client (ex: scan des tâches en retard à chaque visite).
export async function creerNotificationUnique(id, { destinataireId, type, titre, message, lien }) {
  if (!destinataireId) return;
  try {
    const ref = doc(db, "notifications", id);
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    await setDoc(ref, {
      destinataireId,
      type,
      titre,
      message: message || null,
      lien: lien || null,
      lu: false,
      creeLe: serverTimestamp(),
    });
  } catch (err) {
    console.error("Erreur création de notification (unique):", err);
  }
}

export async function marquerNotificationLue(id) {
  await updateDoc(doc(db, "notifications", id), { lu: true });
}

export async function marquerNotificationsLues(ids) {
  await Promise.all(ids.map((id) => updateDoc(doc(db, "notifications", id), { lu: true })));
}

export async function supprimerNotification(id) {
  await deleteDoc(doc(db, "notifications", id));
}

// Écoute les notifications d'un utilisateur. Pas d'orderBy dans la requête
// (pour éviter de dépendre d'un index composite Firestore) : le tri se fait
// côté client.
export function useNotifications(uid) {
  const [documents, setDocuments] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (!uid) {
      // eslint-disable-next-line react/set-state-in-effect
      setDocuments([]);
      setChargement(false);
      return;
    }
    const q = query(collection(db, "notifications"), where("destinataireId", "==", uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => {
          const ta = a.creeLe?.toMillis ? a.creeLe.toMillis() : 0;
          const tb = b.creeLe?.toMillis ? b.creeLe.toMillis() : 0;
          return tb - ta;
        });
        setDocuments(docs);
        setChargement(false);
      },
      () => setChargement(false)
    );
    return unsubscribe;
  }, [uid]);

  return { documents, chargement };
}
