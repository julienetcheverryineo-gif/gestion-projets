// Noms des personnes affectées à un chantier (RA, responsable de chantier,
// automaticiens), dédupliqués — sert à restreindre les sélecteurs de
// responsable de tâche aux gens réellement affectés, pas à tous les
// comptes de l'application.
export function equipeChantier(chantier) {
  const noms = [chantier?.ra, chantier?.responsableChantier, ...(chantier?.automaticiens ?? [])];
  return [...new Set(noms.filter(Boolean))];
}

// Liste des électriciens à proposer comme responsable pour un chantier :
// les électriciens nommés, plus un repère "Électricien à affecter" si le
// chantier a été marqué comme en ayant besoin d'un sans en avoir choisi.
export function electriciensChantier(chantier) {
  const noms = [...(chantier?.electriciens ?? [])];
  if (chantier?.electricienAAffecter) noms.push("Électricien à affecter");
  return noms;
}
