import { useEffect, useState } from "react";
import {
  collection,
  documentId,
  onSnapshot,
  orderBy,
  query,
  where,
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

// "in" est limité à 10 valeurs par Firestore : au-delà, on segmente la
// requête en plusieurs lots qu'on fusionne côté client. Utilisé par les
// deux hooks ci-dessous (espace client : un compte client n'a le droit
// d'interroger que les documents liés à ses chantiers autorisés — une
// requête non filtrée échouerait de toute façon côté règles Firestore).
function enLots(valeurs, taille = 10) {
  const lots = [];
  for (let i = 0; i < valeurs.length; i += taille) {
    lots.push(valeurs.slice(i, i + taille));
  }
  return lots;
}

// Écoute uniquement les documents d'une collection dont l'ID figure dans
// `ids` (ex : les chantiers auxquels un compte client a été autorisé).
export function useCollectionParIds(nomCollection, ids) {
  const [documents, setDocuments] = useState([]);
  const [chargement, setChargement] = useState(true);
  const cleIds = JSON.stringify([...(ids || [])].sort());

  useEffect(() => {
    const listeIds = ids || [];
    if (listeIds.length === 0) {
      setDocuments([]);
      setChargement(false);
      return;
    }
    const lots = enLots(listeIds);
    const resultatsParLot = new Map();
    const unsubscribes = lots.map((lot, index) =>
      onSnapshot(
        query(collection(db, nomCollection), where(documentId(), "in", lot)),
        (snapshot) => {
          resultatsParLot.set(
            index,
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
          );
          setDocuments([...resultatsParLot.values()].flat());
          setChargement(false);
        },
        () => setChargement(false)
      )
    );
    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomCollection, cleIds]);

  return { documents, chargement };
}

// Écoute uniquement les documents d'une collection dont le champ
// `chantierId` figure dans `chantierIds` (ex : les réserves des chantiers
// d'un compte client). Le tri se fait côté client (pas d'orderBy dans la
// requête) pour éviter d'exiger un index composite Firestore.
export function useCollectionParChantiers(nomCollection, chantierIds) {
  const [documents, setDocuments] = useState([]);
  const [chargement, setChargement] = useState(true);
  const cleIds = JSON.stringify([...(chantierIds || [])].sort());

  useEffect(() => {
    const listeIds = chantierIds || [];
    if (listeIds.length === 0) {
      setDocuments([]);
      setChargement(false);
      return;
    }
    const lots = enLots(listeIds);
    const resultatsParLot = new Map();
    const unsubscribes = lots.map((lot, index) =>
      onSnapshot(
        query(collection(db, nomCollection), where("chantierId", "in", lot)),
        (snapshot) => {
          resultatsParLot.set(
            index,
            snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
          );
          setDocuments([...resultatsParLot.values()].flat());
          setChargement(false);
        },
        () => setChargement(false)
      )
    );
    return () => unsubscribes.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomCollection, cleIds]);

  return { documents, chargement };
}
