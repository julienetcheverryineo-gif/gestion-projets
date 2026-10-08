// Tâches MO « complémentaires » d'un chantier Électricité (suivi, étude,
// levée de réserve…) : elles n'existent pas dans la minute de devis, mais
// reçoivent des heures budgétées à la main et des heures SAP réaffectées.
// Un socle fixe est toujours affiché dans le Bilan MO, même à 0 h ; on peut
// en ajouter d'autres, par devis ou au général.
//
// Stockage (document chantier) :
//   tachesMoSup : [{ id, libelle, portee }]  — portee : "tous" (socle fixe,
//     présent dans tous les devis et la synthèse), "<idDevis>" (ajoutée dans
//     ce devis) ou "__general" (ajoutée dans la synthèse)
//   heuresMoSup : { "<idDevis ou __general>||<idTache>": heures }  — heures AJOUTÉES
//   prelevementsMoSup : { "<idDevis ou __general>||<idTache>": heures } — heures
//     PRISES sur la ligne « Sans tâche » (le total ne change pas : elles sont
//     retirées de « Sans tâche » et ajoutées à la tâche)

import { codeTypeFo } from "./exportGoat";

export const GENERAL = "__general";
export const PORTEE_TOUS = "tous";
export const PREFIXE_CLE = "sup:";

export const TACHES_MO_DEFAUT = [
  { id: "suivi", libelle: "Suivi de chantier", portee: PORTEE_TOUS, fixe: true },
  { id: "etude", libelle: "Étude", portee: PORTEE_TOUS, fixe: true },
  { id: "levee", libelle: "Levée de réserve", portee: PORTEE_TOUS, fixe: true },
];

export const cleSup = (id) => PREFIXE_CLE + id;
export const estCleSup = (cle) => typeof cle === "string" && cle.startsWith(PREFIXE_CLE);

export function tachesMoChantier(chantier) {
  const saisies = Array.isArray(chantier?.tachesMoSup) ? chantier.tachesMoSup : null;
  if (!saisies) return TACHES_MO_DEFAUT;
  const ids = new Set(saisies.map((t) => t.id));
  // Le socle fixe reste toujours présent.
  return [...TACHES_MO_DEFAUT.filter((t) => !ids.has(t.id)), ...saisies].map((t) => ({
    ...t,
    fixe: TACHES_MO_DEFAUT.some((d) => d.id === t.id),
  }));
}

const heuresDe = (chantier, scope, id) => Number(chantier?.heuresMoSup?.[scope + "||" + id]) || 0;
const prelevDe = (chantier, scope, id) => Number(chantier?.prelevementsMoSup?.[scope + "||" + id]) || 0;

// Identifiant d'ajustement d'une tâche issue de la minute (par code de type).
export const idTacheMinute = (cle) => "t:" + codeTypeFo(cle);

// Construit le Récap MO complet d'un périmètre à partir du récap « minute » :
//  - toutes les tâches (de la minute ET complémentaires) peuvent être
//    ajustées : heures ajoutées / retirées, heures prises sur « Sans tâche » ;
//  - chaque ligne garde `vendu` (le chiffrage de la minute) pour repérer les
//    dérogations (`deroge`) et, plus tard, les dépassements du vendu ;
//  - la ligne « Sans tâche » est diminuée des heures redistribuées.
// `scope` : GENERAL (synthèse tous devis) ou l'id d'un devis.
export function construireRecapMo(base, chantier, scope, devis) {
  const estSynthese = scope === GENERAL;
  const valeurs = (id) => {
    const ajoutePropre = heuresDe(chantier, scope, id);
    const prelevePropre = prelevDe(chantier, scope, id);
    let ajouteDevis = 0;
    let prelDevis = 0;
    if (estSynthese) {
      devis.forEach((d) => {
        ajouteDevis += heuresDe(chantier, d.id, id);
        prelDevis += prelevDe(chantier, d.id, id);
      });
    }
    return {
      ajoutePropre,
      prelevePropre,
      dansDevis: ajouteDevis + prelDevis,
      ajoute: ajoutePropre + ajouteDevis,
      preleve: prelevePropre + prelDevis,
    };
  };
  const habiller = (l, id, venduBase, estSup, t) => {
    const v = valeurs(id);
    const budget = venduBase + v.ajoute + v.preleve;
    const pct = estSup ? 0 : l.pctAvancement || 0;
    return {
      ...l,
      cle: estSup ? cleSup(t.id) : l.cle,
      libelle: estSup ? t.libelle : l.libelle,
      sup: Boolean(estSup),
      ajustable: true,
      tacheId: id,
      fixe: Boolean(t?.fixe),
      budget,
      realise: pct * budget,
      restant: budget - pct * budget,
      pctAvancement: pct,
      saisie: v.ajoutePropre,
      prelevePropreSaisi: v.prelevePropre,
      dansDevis: v.dansDevis,
      ajoute: v.ajoute,
      preleve: v.preleve,
      // Référence « vendu » : chiffrage de la tâche (minute) ou heures
      // reprises sur « Sans tâche » (tâche complémentaire).
      vendu: estSup ? v.preleve : venduBase,
      deroge: estSup ? v.ajoute !== 0 : v.ajoute !== 0 || v.preleve !== 0,
    };
  };

  const lignesMinute = base.parType.filter((l) => l.cle).map((l) => habiller(l, idTacheMinute(l.cle), l.budget, false, null));
  const lignesSup = tachesMoChantier(chantier)
    .filter((t) => estSynthese || t.portee === PORTEE_TOUS || t.portee === scope)
    .map((t) =>
      habiller(
        { cle: "", libelle: t.libelle, budget: 0, realise: 0, restant: 0, pctAvancement: 0 },
        t.id,
        0,
        true,
        t
      )
    );

  const demande = [...lignesMinute, ...lignesSup].reduce((s, l) => s + l.preleve, 0);
  let preleveEffectif = 0;
  const parType = base.parType.map((l) => {
    if (l.cle) return lignesMinute.find((m) => m.cle === l.cle);
    preleveEffectif = Math.min(Math.max(demande, 0), l.budget);
    const budget = l.budget - preleveEffectif;
    const realise = l.budget > 0 ? l.realise * (budget / l.budget) : 0;
    return {
      ...l,
      budget,
      realise,
      restant: budget - realise,
      pctAvancement: budget > 0 ? realise / budget : 0,
      vendu: l.budget,
      deroge: preleveEffectif > 0,
      preleveEffectif,
    };
  });
  const toutes = [...parType, ...lignesSup];
  const budget = toutes.reduce((s, l) => s + l.budget, 0);
  const realise = toutes.reduce((s, l) => s + l.realise, 0);
  return {
    parType: toutes,
    total: { budget, realise, restant: budget - realise, pctAvancement: budget > 0 ? realise / budget : 0 },
  };
}

// Tâches proposées comme cible d'une heure SAP « au général ».
export function tachesGenerales(chantier) {
  return tachesMoChantier(chantier).filter((t) => t.portee === PORTEE_TOUS || t.portee === GENERAL);
}

export function nouvelIdTache() {
  return "t" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}
