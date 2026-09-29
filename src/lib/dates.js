// Petits utilitaires de date partagés — extraits à part (plutôt que dans
// usePlanningData.js) pour que lib/avancement.js puisse s'en servir sans
// créer un import circulaire entre les deux fichiers.
const MS_JOUR = 86400000;

export function joursEntre(a, b) {
  return Math.round((new Date(b) - new Date(a)) / MS_JOUR);
}

// Formate une Date en "AAAA-MM-JJ" à partir de ses composants LOCAUX,
// plutôt que toISOString() (qui convertit en UTC et peut décaler d'un jour
// selon le fuseau horaire — la France est UTC+1/+2, ce qui ferait glisser
// minuit local vers la veille en UTC).
export function formatDateLocale(date) {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return annee + "-" + mois + "-" + jour;
}
