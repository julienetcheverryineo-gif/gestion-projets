// Petits formatteurs partagés entre les vues Planning (Gantt, Charge) et
// leurs équivalents mobiles — pour ne pas les dupliquer à chaque écran.

export function formatStatutTache(statut) {
  switch (statut) {
    case "en_cours":
      return "En cours";
    case "termine":
      return "Terminé";
    case "suspendu":
      return "Suspendu";
    default:
      return "À faire";
  }
}

// "2026-09-28" -> "28/09"
export function formatDateCourte(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? m[3] + "/" + m[2] : v;
}
