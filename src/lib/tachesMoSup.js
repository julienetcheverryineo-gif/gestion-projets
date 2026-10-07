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
//   heuresMoSup : { "<idDevis ou __general>||<idTache>": heures }

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

function ligneRecap(t, budget, extra = {}) {
  return {
    cle: cleSup(t.id),
    libelle: t.libelle,
    numero: null,
    budget,
    realise: 0,
    restant: budget,
    pctAvancement: 0,
    sup: true,
    tacheId: t.id,
    fixe: Boolean(t.fixe),
    ...extra,
  };
}

// Lignes à ajouter au Récap MO d'un devis : socle fixe + tâches ajoutées dans ce devis.
export function lignesSupDevis(chantier, devisId) {
  return tachesMoChantier(chantier)
    .filter((t) => t.portee === PORTEE_TOUS || t.portee === devisId)
    .map((t) => ligneRecap(t, heuresDe(chantier, devisId, t.id), { saisie: heuresDe(chantier, devisId, t.id) }));
}

// Lignes de la synthèse tous devis : toutes les tâches, budget = heures du
// général + heures de chaque devis. `saisie` = part saisie au général.
export function lignesSupSynthese(chantier, devis) {
  return tachesMoChantier(chantier).map((t) => {
    const general = heuresDe(chantier, GENERAL, t.id);
    const dansDevis = devis.reduce((s, d) => s + heuresDe(chantier, d.id, t.id), 0);
    return ligneRecap(t, general + dansDevis, { saisie: general, dansDevis });
  });
}

// Recap (parType + total) augmenté des lignes complémentaires.
export function injecterSup(recap, lignesSup) {
  const supBudget = lignesSup.reduce((s, l) => s + l.budget, 0);
  const total = {
    ...recap.total,
    budget: recap.total.budget + supBudget,
    restant: recap.total.restant + supBudget,
  };
  total.pctAvancement = total.budget > 0 ? total.realise / total.budget : 0;
  return { parType: [...recap.parType, ...lignesSup], total };
}

// Tâches proposées comme cible d'une heure SAP « au général ».
export function tachesGenerales(chantier) {
  return tachesMoChantier(chantier).filter((t) => t.portee === PORTEE_TOUS || t.portee === GENERAL);
}

export function nouvelIdTache() {
  return "t" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}
