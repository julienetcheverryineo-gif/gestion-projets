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
//   avancementsMoSup : { "<idDevis ou __general>||<idTache>": % (0-100) }
//   tachesMoMasquees : [{ id, libelle }] — tâches supprimées (minute : "t:<code>" ;
//     socle fixe : leur id) ; leurs heures repartent en « Sans tâche »

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
  const masquees = new Set((chantier?.tachesMoMasquees || []).map((t) => t.id));
  const avancements = chantier?.avancementsMoSup || {};
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
  // % d'avancement d'une tâche complémentaire : saisi par devis (et au
  // général) ; en synthèse, moyenne pondérée par les heures de chaque périmètre.
  const pctSup = (id, v) => {
    const pctDe = (sc) => (Number(avancements[sc + "||" + id]) || 0) / 100;
    if (!estSynthese) return pctDe(scope);
    const parts = [{ sc: GENERAL, h: v.ajoutePropre + v.prelevePropre }];
    devis.forEach((d) => parts.push({ sc: d.id, h: heuresDe(chantier, d.id, id) + prelevDe(chantier, d.id, id) }));
    const total = parts.reduce((s, x) => s + x.h, 0);
    if (total <= 0) return pctDe(GENERAL);
    return parts.reduce((s, x) => s + pctDe(x.sc) * x.h, 0) / total;
  };
  const habiller = (l, id, venduBase, estSup, t) => {
    const v = valeurs(id);
    const budget = venduBase + v.ajoute + v.preleve;
    const pct = estSup ? pctSup(id, v) : l.pctAvancement || 0;
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

  // Tâches de la minute supprimées : leurs heures repartent en « Sans tâche ».
  let retourBudget = 0;
  let retourRealise = 0;
  const lignesMinute = [];
  base.parType
    .filter((l) => l.cle)
    .forEach((l) => {
      const id = idTacheMinute(l.cle);
      if (masquees.has(id)) {
        retourBudget += l.budget;
        retourRealise += l.realise;
      } else {
        lignesMinute.push(habiller(l, id, l.budget, false, null));
      }
    });
  const lignesSup = tachesMoChantier(chantier)
    .filter((t) => !masquees.has(t.id))
    .filter((t) => estSynthese || t.portee === PORTEE_TOUS || t.portee === scope)
    .map((t) =>
      habiller({ cle: "", libelle: t.libelle, budget: 0, realise: 0, restant: 0, pctAvancement: 0 }, t.id, 0, true, t)
    );

  const baseSans = base.parType.find((l) => !l.cle);
  const sansBrut = (baseSans?.budget || 0) + retourBudget;
  const sansRealiseBrut = (baseSans?.realise || 0) + retourRealise;
  const demande = [...lignesMinute, ...lignesSup].reduce((s, l) => s + l.preleve, 0);
  const preleveEffectif = Math.min(Math.max(demande, 0), sansBrut);
  const sansBudget = sansBrut - preleveEffectif;
  const sansRealise = sansBrut > 0 ? sansRealiseBrut * (sansBudget / sansBrut) : 0;
  const lignesSans =
    sansBudget > 0.005
      ? [
          {
            ...(baseSans || { cle: "", libelle: "Sans tâche", numero: null }),
            budget: sansBudget,
            realise: sansRealise,
            restant: sansBudget - sansRealise,
            pctAvancement: sansBudget > 0 ? sansRealise / sansBudget : 0,
            vendu: sansBrut,
            deroge: preleveEffectif > 0,
            preleveEffectif,
            retourBudget,
          },
        ]
      : [];

  const toutes = [...lignesMinute, ...lignesSup, ...lignesSans];
  const budget = toutes.reduce((s, l) => s + l.budget, 0);
  const realise = toutes.reduce((s, l) => s + l.realise, 0);
  return {
    parType: toutes,
    sansTacheBrut: sansBrut,
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
