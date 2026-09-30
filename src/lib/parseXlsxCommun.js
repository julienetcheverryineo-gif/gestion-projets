// Petites fonctions partagées entre les différents lecteurs de classeurs
// Excel (minute de devis Automatisme, minute de devis Électricité...) :
// détection de l'en-tête, recherche de colonne par libellé, et le motif
// des codes de poste hiérarchiques ("A", "A.1", "A.1.1").

// Un "code" de poste : lettres, puis zéro ou plusieurs groupes ".chiffres".
export const RE_CODE = /^[A-Za-z]+(\.\d+)*$/;

export function normaliser(texte) {
  return String(texte ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function trouverLigneEntete(rows, clesRepere) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const ligne = rows[i].map(normaliser);
    if (ligne.some((c) => clesRepere.includes(c))) {
      return i;
    }
  }
  return -1;
}

export function trouverColonne(entete, cles) {
  const normalisee = entete.map(normaliser);
  for (let c = 0; c < normalisee.length; c++) {
    if (cles.some((cle) => normalisee[c] === cle)) return c;
  }
  return -1;
}
