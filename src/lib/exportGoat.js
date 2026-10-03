import * as XLSX from "xlsx";
import { CORRESPONDANCE_SAP_QDV } from "./correspondanceSapQdv";

// En-têtes EXACTS du classeur modèle fourni par Julien (voir
// Modele_pour_goat.xlsx) — l'outil GOAT attend ces intitulés précis, espaces
// compris ("Poste " et "Avct réel " se terminent par une espace dans le
// modèle).
const ENTETES_FOURNITURE = [
  "Type",
  "Besoin / GO",
  "Libellé",
  "Budget €",
  "Devis",
  "Réalisé",
  "Gain potentiel",
  "RAE",
  "EAT",
  "Boni Mali",
  "Achat prévu",
  "Commentaires",
];
const ENTETES_MO = [
  "Poste ",
  "Libellé",
  "Budget H",
  "Réalisé",
  "RAE",
  "EAT",
  "Ecart Eat / Budget",
  "Avct réel ",
  "Avct théo",
  "RAE / % Avt réel",
  "Ecart / Budget",
];

// Table de correspondance Code QDV -> {codeSap, libelleSap}, indexée une
// fois pour toutes (voir lib/correspondanceSapQdv.js).
const SAP_PAR_CODE_QDV = new Map(
  CORRESPONDANCE_SAP_QDV.filter((l) => l.codeQdv != null).map((l) => [
    String(l.codeQdv),
    { codeSap: l.codeSap, libelleSap: l.libelleSap },
  ])
);

// Une ligne elecLignes stocke son Type de FO au format
// "<code>  [<libellé>]" (voir valeurType dans lib/typesElectricite.js) —
// extrait ici le code et le libellé bruts. Plus robuste que formatTypeFo
// (réservé à l'affichage), qui ne reconnaît que les codes numériques : ici
// les codes alphabétiques (CHIF, DV, STOR...) doivent aussi être lus.
function codeTypeFo(typeFo) {
  if (!typeFo) return "";
  const m = typeFo.match(/^(.*?)\s*\[/);
  return (m ? m[1] : typeFo).trim();
}
function libelleTypeFo(typeFo) {
  if (!typeFo) return "";
  const m = typeFo.match(/\[([^\]]*)\]/);
  return (m ? m[1] : typeFo).trim();
}

// "Automatisme & Contrôle" -> "AUTOMATI" : 8 caractères max, majuscules,
// sans accents ni ponctuation — résumé du Poste (onglet Main d'œuvre).
function resumerPoste(libelle) {
  return (libelle || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

// Somme d'un champ chiffré (coutTotalFo ou tempsTotalHeures), groupée par
// Type de FO — même regroupement que le Récap du chantier (voir
// calculerRecap dans ElectriciteSiteDetail.jsx), sur le même périmètre
// "tous devis du chantier".
function sommeParTypeFo(lignes, champValeur) {
  const parType = new Map();
  lignes.forEach((l) => {
    const valeur = l[champValeur] || 0;
    if (!valeur) return;
    const code = codeTypeFo(l.typeFo);
    if (!code) return;
    if (!parType.has(code)) {
      parType.set(code, { code, libelle: libelleTypeFo(l.typeFo), valeur: 0 });
    }
    parType.get(code).valeur += valeur;
  });
  return [...parType.values()].sort((a, b) =>
    a.code.localeCompare(b.code, "fr", { numeric: true })
  );
}

function feuilleAvecEntetes(lignes, entetes) {
  if (lignes.length === 0) return XLSX.utils.aoa_to_sheet([entetes]);
  return XLSX.utils.json_to_sheet(lignes, { header: entetes });
}

// Construit et télécharge le fichier d'import GOAT d'un chantier
// Électricité : deux onglets (Fourniture, Main d'œuvre), sur la trame
// exacte du modèle, à partir du Récap "synthèse tous devis" du chantier
// (même donnée que les onglets Bilan Fournitures / Bilan Main d'œuvre).
//
// - Fourniture : une ligne par Type de FO présent dans le Bilan
//   Fournitures, Besoin/GO et Libellé via la correspondance Code SAP (voir
//   lib/correspondanceSapQdv.js) — à défaut de correspondance connue, on
//   reprend tel quel le code/libellé du Type de FO plutôt que de perdre le
//   budget. Budget € = somme du coût total FO. Tout le reste à 0.
// - Main d'œuvre : une ligne par Type de FO présent dans le Bilan Main
//   d'œuvre, Poste = résumé 8 caractères du libellé, Budget H = somme des
//   heures prévues. Tout le reste à 0.
export function exporterGoat({ chantier, lignesChantier }) {
  const lignesChiffrables = lignesChantier.filter((l) => !l.estPoste);

  const fournitures = sommeParTypeFo(lignesChiffrables, "coutTotalFo").map((t) => {
    const sap = SAP_PAR_CODE_QDV.get(t.code);
    return {
      Type: "Fourniture",
      "Besoin / GO": sap ? sap.codeSap : t.code,
      Libellé: sap ? sap.libelleSap : t.libelle,
      "Budget €": t.valeur,
      Devis: 0,
      Réalisé: 0,
      "Gain potentiel": 0,
      RAE: 0,
      EAT: 0,
      "Boni Mali": 0,
      "Achat prévu": 0,
      Commentaires: 0,
    };
  });

  const mainOeuvre = sommeParTypeFo(lignesChiffrables, "tempsTotalHeures").map((t) => ({
    "Poste ": resumerPoste(t.libelle),
    Libellé: t.libelle,
    "Budget H": t.valeur,
    Réalisé: 0,
    RAE: 0,
    EAT: 0,
    "Ecart Eat / Budget": 0,
    "Avct réel ": 0,
    "Avct théo": 0,
    "RAE / % Avt réel": 0,
    "Ecart / Budget": 0,
  }));

  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    classeur,
    feuilleAvecEntetes(fournitures, ENTETES_FOURNITURE),
    "Fourniture"
  );
  XLSX.utils.book_append_sheet(classeur, feuilleAvecEntetes(mainOeuvre, ENTETES_MO), "Main d'oeuvre");

  const nomChantier = (chantier?.nom || "chantier").replace(/[\\/:*?"<>|]/g, "-");
  XLSX.writeFile(classeur, `GOAT - ${nomChantier}.xlsx`);
}
