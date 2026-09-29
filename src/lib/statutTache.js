// Détermine les champs à écrire quand on modifie le % d'avancement d'une
// tâche : le champ lui-même, et le statut remis en cohérence
// automatiquement — sans quoi on se retrouve avec une tâche à 60 %
// encore marquée "à faire" (signalé comme un bug). Règles :
//   - un % > 0 démarre la tâche ("en cours") si elle était encore
//     "à faire" ;
//   - un % à 100 la termine ;
//   - un statut déjà "terminé" n'est jamais reculé par un simple
//     changement de %, pour ne pas défaire une clôture manuelle.
export function champsAvancement(tache, valeur) {
  const v = valeur === null || valeur === "" || valeur === undefined ? null : Number(valeur);
  const maj = { avancement: v };
  const statutActuel = tache.statut ?? "a_faire";
  if (v !== null && v >= 100 && statutActuel !== "termine") {
    maj.statut = "termine";
  } else if (v !== null && v > 0 && v < 100 && statutActuel === "a_faire") {
    maj.statut = "en_cours";
  }
  return maj;
}
