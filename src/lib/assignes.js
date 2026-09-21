// Les tâches affectaient historiquement une seule personne (chaîne de
// caractères). On passe à plusieurs personnes (tableau), mais les
// anciennes données existent encore en base — cette fonction uniformise
// toujours vers un tableau, quelle que soit la forme stockée.
export function normaliserAssignes(valeur) {
  if (Array.isArray(valeur)) return valeur.filter(Boolean);
  if (valeur) return [valeur];
  return [];
}
