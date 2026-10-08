import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { normaliserTypeActivite } from "./typesActiviteSap";

// Taux horaires (€/h) par type d'activité SAP — « famille » de coût.
// Valeurs de départ ; l'admin les modifie dans Import SAP (document
// parametresElec/tauxHoraires). Un type absent de la table reste vide.
export const TAUX_DEFAUT = {
  I106: { famille: "IAQ5I106", taux: 81.1 },
  I107: { famille: "IAQ5I107", taux: 69.5 },
  I102: { famille: "IAQ5I102", taux: 52 },
  I108: { famille: "IAQ5I108", taux: 60.2 },
  I203: { famille: "IAQ5I203", taux: 53 },
  I205: { famille: "IAQ5I205", taux: 49 },
  I207: { famille: "IAQ5I207", taux: 42.5 },
  I209: { famille: "IAQ5I209", taux: 64.5 },
  I302: { famille: "IAQ5I302", taux: 44.5 },
  I303: { famille: "IAQ5I303", taux: 40 },
  I306: { famille: "IAQ5I306", taux: 36 },
  I314: { famille: "IAQ5I314", taux: 33 },
  I311: { famille: "IAQ5I311", taux: 36 },
};

export const DOC_TAUX = ["parametresElec", "tauxHoraires"];

// Écoute les taux modifiés par l'admin ; `taux(code)` rend le taux effectif
// (valeur enregistrée, sinon valeur par défaut, sinon null).
export function useTauxHoraires() {
  const [enregistres, setEnregistres] = useState({});
  const [chargement, setChargement] = useState(true);
  useEffect(
    () =>
      onSnapshot(
        doc(db, ...DOC_TAUX),
        (snap) => {
          setEnregistres(snap.exists() ? snap.data().taux || {} : {});
          setChargement(false);
        },
        () => setChargement(false)
      ),
    []
  );
  const taux = useMemo(() => {
    return (code) => {
      const c = normaliserTypeActivite(code);
      if (Object.prototype.hasOwnProperty.call(enregistres, c)) {
        const v = enregistres[c];
        return typeof v === "number" && v >= 0 ? v : null;
      }
      return TAUX_DEFAUT[c]?.taux ?? null;
    };
  }, [enregistres]);
  return { taux, chargement };
}

// valeur null = taux vidé (explicitement non renseigné).
export async function enregistrerTaux(code, valeur) {
  await setDoc(
    doc(db, ...DOC_TAUX),
    { taux: { [normaliserTypeActivite(code)]: valeur }, majLe: new Date() },
    { merge: true }
  );
}
