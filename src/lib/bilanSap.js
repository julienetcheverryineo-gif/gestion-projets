import { CORRESPONDANCE_SAP_QDV } from "./correspondanceSapQdv";
import { codeTypeFo } from "./exportGoat";

// Rapprochement du Bilan FO/MO d'un chantier Électricité avec les données
// SAP réelles (achats et pointages importés via la page Import SAP) : le
// chantier est relié à SAP par son code OTP (champ "Compte", voir
// otpDepuisCompte dans parseSapExports.js) — les lignes reçues ici sont
// déjà filtrées sur cet OTP.

// Code SAP d'une ligne d'achat (grOr) -> code QDV du Type de FO.
const QDV_PAR_CODE_SAP = new Map(
  CORRESPONDANCE_SAP_QDV.filter((l) => l.codeQdv != null).map((l) => [
    l.codeSap.toUpperCase(),
    String(l.codeQdv),
  ])
);

// Achats SAP rapprochés des lignes du Récap FO (une ligne par Type de FO).
// Une ligne d'achat va sur le Type de FO dont le code correspond à son Code
// SAP ; si le devis ne comporte que des sous-codes de ce type (151/152/153
// pour le code 15 "Eclairage"), elle va sur le premier de ces sous-types
// (SAP ne distingue pas les sous-types). Tout ce qui ne se rattache à aucun
// Type de FO du budget (Code SAP sans correspondance, ou type absent du
// devis) est regroupé dans `horsBudget`, pour que le total reste égal au
// total réellement acheté dans SAP.
//
// `affectations` (par chantier, voir affectationsSapFo sur le document
// chantier) permet de corriger ce rapprochement à la main, Code SAP par
// Code SAP : { "DIVE": "<Type de FO>" } force ce Code SAP sur ce type, et
// { "DIVE": AFFECTATION_HORS_BUDGET } le laisse volontairement hors budget.
// Une affectation vers un type qui n'est plus dans le budget est ignorée
// (retour au rapprochement automatique).
export const AFFECTATION_HORS_BUDGET = "__hors";

export function rapprocherAchats(parType, achatsSap, affectations = {}) {
  const codes = parType.map((t) => codeTypeFo(t.cle));
  const parCle = new Map(parType.map((t) => [t.cle, { reel: 0, lignes: [] }]));
  const horsBudget = { reel: 0, lignes: [] };

  const cleDuType = (codeQdv) => {
    let i = codes.indexOf(codeQdv);
    if (i === -1) i = codes.findIndex((c) => /^\d{3,}$/.test(c) && c.slice(0, 2) === codeQdv);
    return i === -1 ? null : parType[i].cle;
  };

  achatsSap.forEach((a) => {
    const codeSap = (a.grOr || "").trim().toUpperCase();
    const manuel = affectations[codeSap];
    let cle;
    if (manuel === AFFECTATION_HORS_BUDGET) {
      cle = null;
    } else if (manuel && parCle.has(manuel)) {
      cle = manuel;
    } else {
      const codeQdv = QDV_PAR_CODE_SAP.get(codeSap);
      cle = codeQdv ? cleDuType(codeQdv) : null;
    }
    const cible = cle !== null ? parCle.get(cle) : horsBudget;
    cible.reel += Number(a.valNette) || 0;
    cible.lignes.push(a);
  });

  const totalReel = [...parCle.values()].reduce((s, g) => s + g.reel, 0) + horsBudget.reel;
  return { parCle, horsBudget, totalReel };
}

// Heures SAP réellement pointées sur le chantier, avec le détail par
// personne. SAP ne connaît pas les Types de FO : côté Main d'œuvre, le
// rapprochement ne se fait donc qu'au niveau du chantier.
export function totaliserHeures(heuresSap) {
  const parPersonne = new Map();
  heuresSap.forEach((h) => {
    const nom = h.nomPrenom || "(inconnu)";
    if (!parPersonne.has(nom)) parPersonne.set(nom, { nom, heures: 0, jours: new Set() });
    const p = parPersonne.get(nom);
    p.heures += Number(h.heures) || 0;
    if (h.date) p.jours.add(h.date);
  });
  const personnes = [...parPersonne.values()]
    .map((p) => ({ nom: p.nom, heures: p.heures, nbJours: p.jours.size }))
    .sort((a, b) => b.heures - a.heures);
  return { totalReel: personnes.reduce((s, p) => s + p.heures, 0), personnes };
}
