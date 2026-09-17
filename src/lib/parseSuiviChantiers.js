import * as XLSX from "xlsx";

const FEUILLES_IGNOREES = ["referentiel", "modele", "bilan"];

function normaliser(texte) {
  return String(texte ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formaterDate(valeur) {
  if (!valeur) return null;
  if (valeur instanceof Date) return valeur.toISOString().slice(0, 10);
  return null; // dates textuelles ("31/12/2026") ignorées : trop peu fiables à parser
}

// Lit le classeur "Chantiers en cours" (un onglet par client) et retourne un
// chantier par onglet avec la liste de ses tâches, prêts à importer.
export function parseSuiviChantiers(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });

  const chantiers = [];

  for (const nomFeuille of workbook.SheetNames) {
    if (FEUILLES_IGNOREES.includes(normaliser(nomFeuille))) continue;
    const feuille = workbook.Sheets[nomFeuille];
    const rows = XLSX.utils.sheet_to_json(feuille, { header: 1, defval: "" });
    if (rows.length < 3) continue;

    let compte = "";
    const taches = [];

    for (let i = 3; i < rows.length; i++) {
      const [nomZone, descriptif, heures, responsable, compteLigne, dateDebut, dateFin, lienDevis, commentaires] =
        rows[i];
      if (normaliser(descriptif) === "totaux heures" || normaliser(descriptif) === "total heures")
        continue;
      if (!nomZone && !descriptif) continue;

      if (compteLigne && !compte) compte = String(compteLigne).trim();

      const responsableTexte = String(responsable ?? "").trim();
      const estAAffecter = /^a\s*attr/i.test(responsableTexte); // "A attriibuer" (avec la coquille du fichier)

      const titre = [nomZone, descriptif].filter(Boolean).join(" — ") || descriptif || nomZone;
      if (!titre) continue;

      taches.push({
        titre,
        heuresPrevues: typeof heures === "number" && heures > 0 ? heures : null,
        assigneA: estAAffecter || !responsableTexte ? null : responsableTexte,
        dateDebut: formaterDate(dateDebut),
        echeance: formaterDate(dateFin),
        lienDevis: lienDevis ? String(lienDevis).trim() : null,
        commentaires: commentaires ? String(commentaires).trim() : null,
      });
    }

    if (taches.length === 0) continue;
    chantiers.push({ nom: nomFeuille.trim(), compte, taches, selectionne: true });
  }

  return chantiers;
}
