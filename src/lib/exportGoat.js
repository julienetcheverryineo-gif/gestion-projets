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
export function codeTypeFo(typeFo) {
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

// Certains Types de FO sont des sous-codes à 3 chiffres d'un code parent à
// 2 chiffres (ex: Eclairage bureau/industriel/sdV = 151/152/153, qui sont
// tous trois du 15 "Eclairage" ; Photovoltaïque = 321-324, qui sont tous du
// 32). Pris isolément, ces sous-codes n'ont pas de correspondance SAP (seul
// le code parent en a une) — on les ramène donc sur leur code parent QUAND
// celui-ci a une correspondance SAP connue, pour qu'ils se retrouvent
// sommés sur une seule ligne Fourniture (ex: "151"+"152"+"153" → une seule
// ligne ECLN/ECLAIRAGE) plutôt que trois lignes orphelines sans code SAP.
// Ne s'applique qu'à la Fourniture : côté Main d'œuvre, chaque sous-type
// garde sa propre ligne (pas de notion de code SAP à retrouver là-bas).
function codeParentFourniture(code) {
  if (!SAP_PAR_CODE_QDV.has(code) && /^\d{3,}$/.test(code)) {
    const parent = code.slice(0, 2);
    if (SAP_PAR_CODE_QDV.has(parent)) return parent;
  }
  return code;
}

// Somme d'un champ chiffré (coutTotalFo ou tempsTotalHeures), groupée par
// Type de FO — même regroupement que le Récap du chantier (voir
// calculerRecap dans ElectriciteSiteDetail.jsx), sur le même périmètre
// "tous devis du chantier". `normaliserCode` permet de fusionner plusieurs
// codes sous une même clé avant de sommer (voir codeParentFourniture).
function sommeParTypeFo(lignes, champValeur, normaliserCode) {
  const parType = new Map();
  lignes.forEach((l) => {
    const valeur = l[champValeur] || 0;
    if (!valeur) return;
    const codeBrut = codeTypeFo(l.typeFo);
    if (!codeBrut) return;
    const code = normaliserCode ? normaliserCode(codeBrut) : codeBrut;
    if (!parType.has(code)) {
      parType.set(code, { code, libelle: libelleTypeFo(l.typeFo), valeur: 0 });
    }
    parType.get(code).valeur += valeur;
  });
  return [...parType.values()].sort((a, b) =>
    a.code.localeCompare(b.code, "fr", { numeric: true })
  );
}

// Types de FO de sous-traitance / co-traitance (TypeID GOAT = 2) : les
// familles STOR/STIN/STPD/COT et leurs sous-codes (70-79, 80-85, 90-95).
export function estSousTraitance(code) {
  const c = String(code || "").trim().toUpperCase();
  if (/^(STOR|STIN|STPD|COT\d?)$/.test(c)) return true;
  const n = /^\d+$/.test(c) ? Number(c) : null;
  return n != null && ((n >= 70 && n <= 85) || (n >= 90 && n <= 95));
}

// Lignes Fourniture à écrire dans GOAT (fichier d'import ou table Fourniture
// de la base) : une par Type de FO, code/libellé SAP quand une correspondance
// existe, budget = somme du coût total FO. typeId : 1 fourniture, 2 sous-traitant.
export function lignesFournitureGoat(lignesChiffrables) {
  return sommeParTypeFo(lignesChiffrables, "coutTotalFo", codeParentFourniture).map((t) => {
    const sap = SAP_PAR_CODE_QDV.get(t.code);
    return {
      typeId: estSousTraitance(t.code) ? 2 : 1,
      code: String(sap ? sap.codeSap : t.code).trim(),
      libelle: String(sap ? sap.libelleSap : t.libelle).trim(),
      budget: Math.round(t.valeur * 100) / 100,
    };
  });
}

// Lignes Main d'œuvre à écrire dans GOAT (fichier d'import ou table
// MainOeuvre de la base) : une par Type de FO, Poste = résumé 8 caractères du
// libellé, heures = somme des heures prévues.
export function lignesMainOeuvreGoat(lignesChiffrables) {
  const parCode = new Map();
  sommeParTypeFo(lignesChiffrables, "tempsTotalHeures").forEach((t) => {
    const code = resumerPoste(t.libelle) || String(t.code).slice(0, 8);
    if (parCode.has(code)) parCode.get(code).heures += t.valeur;
    else parCode.set(code, { code, libelle: String(t.libelle || t.code).trim().slice(0, 255), heures: t.valeur });
  });
  return [...parCode.values()].map((m) => ({ ...m, heures: Math.round(m.heures * 100) / 100 }));
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
//   lib/correspondanceSapQdv.js) — les sous-codes à 3 chiffres d'un code
//   parent connu (ex: 151/152/153 → 15 "Eclairage") sont sommés sur la
//   ligne du parent (voir codeParentFourniture) ; à défaut de
//   correspondance connue, on reprend tel quel le code/libellé du Type de
//   FO plutôt que de perdre le budget. Budget € = somme du coût total FO.
//   Tout le reste à 0.
// - Main d'œuvre : une ligne par Type de FO présent dans le Bilan Main
//   d'œuvre, Poste = résumé 8 caractères du libellé, Budget H = somme des
//   heures prévues. Tout le reste à 0.
export function exporterGoat({ chantier, lignesChantier }) {
  const lignesChiffrables = lignesChantier.filter((l) => !l.estPoste);

  const fournitures = lignesFournitureGoat(lignesChiffrables).map((f) => ({
    Type: f.typeId === 2 ? "Sous-Traitance" : "Fourniture",
    "Besoin / GO": f.code,
    Libellé: f.libelle,
    "Budget €": f.budget,
    Devis: 0,
    Réalisé: 0,
    "Gain potentiel": 0,
    RAE: 0,
    EAT: 0,
    "Boni Mali": 0,
    "Achat prévu": 0,
    Commentaires: 0,
  }));

  const mainOeuvre = lignesMainOeuvreGoat(lignesChiffrables).map((m) => ({
    "Poste ": m.code,
    Libellé: m.libelle,
    "Budget H": m.heures,
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
