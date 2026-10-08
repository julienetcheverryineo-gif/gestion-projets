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

// Paramètres de la feuille d'ouverture d'affaire (FOA) pour le bilan
// financier : pourcentages applicables au centre de profit (valeurs IAQ5).
export const PARAMS_FOA_DEFAUT = {
  fg: { label: "Frais généraux (% du CA H.T.)", valeur: 0.16 },
  fra: { label: "FRA (% des dépenses)", valeur: 0.03346 },
  prorata: { label: "Prorata (% du CA H.T.)", valeur: 0.02 },
  fraisDivers: { label: "Frais divers / provision (% de la MO)", valeur: 0.02 },
  aleas: { label: "Aléas (% du CA H.T.)", valeur: 0.02 },
  negociation: { label: "Négociation (% du CA H.T.)", valeur: 0.02 },
  margePreconisee: { label: "Marge nette préconisée (% du CA)", valeur: 0.07 },
};
export const DOC_FOA = ["parametresElec", "foa"];

export function useParametresFoa() {
  const [enregistres, setEnregistres] = useState({});
  useEffect(
    () =>
      onSnapshot(
        doc(db, ...DOC_FOA),
        (snap) => setEnregistres(snap.exists() ? snap.data().valeurs || {} : {}),
        () => {}
      ),
    []
  );
  return useMemo(() => {
    const r = {};
    Object.keys(PARAMS_FOA_DEFAUT).forEach((k) => {
      r[k] = typeof enregistres[k] === "number" ? enregistres[k] : PARAMS_FOA_DEFAUT[k].valeur;
    });
    return r;
  }, [enregistres]);
}

export async function enregistrerParametreFoa(cle, valeur) {
  await setDoc(doc(db, ...DOC_FOA), { valeurs: { [cle]: valeur }, majLe: new Date() }, { merge: true });
}

// Indemnités de petit déplacement par zone (€ par jour, centre de profit
// IAQ5 dans la FOA). Valorisent les pointages SAP « J » et « F » : heures ×
// montant ÷ 7,2 h (journée de référence de la FOA).
export const HEURES_PAR_JOUR_ZONE = 7.2;
export const ZONES_DEFAUT = [
  { code: "Z1", label: "Z1 -> 0 - 10 km", montant: 24.28 },
  { code: "Z2", label: "Z2 -> 10 - 20 km", montant: 30.28 },
  { code: "Z3", label: "Z3 -> 20 - 30 km", montant: 37.23 },
  { code: "Z4", label: "Z4 -> 30 - 40 km", montant: 43.45 },
  { code: "Z5", label: "Z5 -> 40 - 50 km", montant: 50.82 },
  { code: "Z6", label: "Z6 -> Sup. 50 km", montant: 57.08 },
  { code: "GD", label: "GD -> Grand déplacement", montant: 97 },
];
export const DOC_ZONES = ["parametresElec", "zones"];

// Rend `montant(codeZone)` : montant enregistré, sinon valeur par défaut.
export function useMontantsZone() {
  const [enregistres, setEnregistres] = useState({});
  useEffect(
    () =>
      onSnapshot(
        doc(db, ...DOC_ZONES),
        (snap) => setEnregistres(snap.exists() ? snap.data().montants || {} : {}),
        () => {}
      ),
    []
  );
  return useMemo(
    () => (code) => {
      if (!code) return null;
      if (Object.prototype.hasOwnProperty.call(enregistres, code)) {
        const v = enregistres[code];
        return typeof v === "number" && v >= 0 ? v : null;
      }
      return ZONES_DEFAUT.find((z) => z.code === code)?.montant ?? null;
    },
    [enregistres]
  );
}

export async function enregistrerMontantZone(code, valeur) {
  await setDoc(doc(db, ...DOC_ZONES), { montants: { [code]: valeur }, majLe: new Date() }, { merge: true });
}
