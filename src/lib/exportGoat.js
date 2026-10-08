import { CORRESPONDANCE_SAP_QDV } from "./correspondanceSapQdv";

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
export function libelleTypeFo(typeFo) {
  if (!typeFo) return "";
  const m = typeFo.match(/\[([^\]]*)\]/);
  return (m ? m[1] : typeFo).trim();
}

// "Automatisme & Contrôle" -> "AUTOMATI" : 8 caractères max, majuscules,
// sans accents ni ponctuation — résumé du Poste (onglet Main d'œuvre).
export function resumerPoste(libelle) {
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

// Code MO à 8 caractères (SAP tâche + GOAT) : valeur saisie si elle existe,
// sinon le résumé du libellé. Majuscules, lettres/chiffres, 8 max.
export function codeMo(saisi, defaut) {
  const net = String(saisi ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return net || String(defaut || "");
}

// Lignes Main d'œuvre à écrire dans GOAT (table MainOeuvre) à partir du
// Récap MO final de la synthèse (heures adaptées comprises) : une ligne par
// tâche ayant des heures, code à 8 caractères (modifiable, voir codeMo).
export function lignesMainOeuvreGoat(recapMo, codesMo = {}) {
  const parCode = new Map();
  recapMo.parType
    .filter((l) => l.cle && l.budget > 0)
    .forEach((l) => {
      const libelle = l.sup ? l.libelle : libelleTypeFo(l.cle) || l.libelle;
      const cleCode = l.sup ? l.cle : codeTypeFo(l.cle);
      const code = codeMo(codesMo[cleCode], resumerPoste(libelle) || (l.sup ? "TACHE" : String(cleCode).slice(0, 8)));
      if (parCode.has(code)) parCode.get(code).heures += l.budget;
      else parCode.set(code, { code, libelle: String(libelle).trim().slice(0, 255), heures: l.budget });
    });
  return [...parCode.values()].map((m) => ({ ...m, heures: Math.round(m.heures * 100) / 100 }));
}
