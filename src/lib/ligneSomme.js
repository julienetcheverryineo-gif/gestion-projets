// Ligne « somme » d'une minute : tête de regroupement (gris clair, sans unité
// ni type) qui affiche le total de ses sous-postes. Elle est importée comme
// ligne informative mais porte des montants/heures : il ne faut jamais la
// compter dans les bilans, sous peine de doubler les sous-postes.
export function estLigneSomme(l) {
  return Boolean(l && !l.estPoste && l.informative && ((l.coutTotalFo || 0) || (l.tempsTotalHeures || 0)));
}
