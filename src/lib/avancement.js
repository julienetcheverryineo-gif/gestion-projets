// Avancement d'un chantier en % : compte à la fois le matériel/tâches des
// équipements régulés (statut "teste"/"fait") et les tâches classiques
// (statut "termine") — l'ensemble des tâches, pas seulement une partie.
export function calculerAvancementChantier(chantierId, { regEquipements, regItems, taches }) {
  const regsDuChantier = regEquipements.filter((r) => r.chantierId === chantierId);
  const items = regItems.filter((it) =>
    regsDuChantier.some((r) => r.id === it.regEquipementId)
  );
  const tachesDuChantier = taches.filter((t) => t.chantierId === chantierId);

  const total = items.length + tachesDuChantier.length;
  if (total === 0) return null;

  const faits =
    items.filter((it) => it.statut === "teste" || it.statut === "fait").length +
    tachesDuChantier.filter((t) => t.statut === "termine").length;

  return Math.round((faits / total) * 100);
}
