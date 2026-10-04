// Découpe une recherche en plusieurs termes séparés par un espace ou un
// point-virgule (ex. "puissance;tension" ou "puissance tension"), pour
// filtrer sur plusieurs mots à la fois : une ligne correspond si au moins
// un des termes est trouvé dans l'un des champs fournis. Utilisé partout
// où l'appli propose un champ de recherche libre sur une liste.
export function correspondARecherche(recherche, champs) {
  const termes = recherche
    .trim()
    .toLowerCase()
    .split(/[\s;]+/)
    .filter(Boolean);
  if (termes.length === 0) return true;
  const valeurs = champs.map((c) => String(c ?? "").toLowerCase());
  return termes.some((t) => valeurs.some((v) => v.includes(t)));
}
