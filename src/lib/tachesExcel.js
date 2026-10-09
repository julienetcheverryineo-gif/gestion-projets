import * as XLSX from "xlsx";
import { normaliserAssignes } from "./assignes";
import { libelleChantier } from "./usePlanningData";

const STATUT_LABEL = { a_faire: "À faire", en_cours: "En cours", termine: "Terminé", suspendu: "Suspendu" };
const LABEL_STATUT = Object.fromEntries(
  Object.entries(STATUT_LABEL).map(([code, label]) => [label.toLowerCase(), code])
);

function formatDate(v) {
  // Un export xlsx relu avec cellDates renvoie des objets Date pour les
  // colonnes date ; on les reconvertit en "AAAA-MM-JJ" local.
  if (!v) return "";
  if (v instanceof Date) {
    const annee = v.getFullYear();
    const mois = String(v.getMonth() + 1).padStart(2, "0");
    const jour = String(v.getDate()).padStart(2, "0");
    return annee + "-" + mois + "-" + jour;
  }
  const s = String(v).trim();
  // Excel peut aussi renvoyer "JJ/MM/AAAA" si la cellule n'était pas
  // reconnue comme une date par la lecture ; on tente cette forme aussi.
  const mFr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mFr) return mFr[3] + "-" + mFr[2].padStart(2, "0") + "-" + mFr[1].padStart(2, "0");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

// Génère et télécharge un classeur avec une ligne par tâche : les colonnes
// Chantier/Titre/Responsable/Statut servent juste de repère (pas relues à
// l'import), seules Début/Fin/Heures prévues/Avancement sont réinjectées —
// ce sont elles qui sont fastidieuses à saisir une par une dans l'appli,
// alors qu'un tableur permet de les remplir/glisser en quelques secondes.
export function exporterTachesExcel(taches, chantiers) {
  const nomChantier = (id) => libelleChantier(chantiers.find((c) => c.id === id));
  const lignes = taches
    .filter((t) => t._source !== "regitem")
    .map((t) => ({
      ID: t.id,
      Chantier: t.chantierId ? nomChantier(t.chantierId) : "À affecter",
      Titre: t.titre || "",
      Responsable: normaliserAssignes(t.assigneA).join(", "),
      Début: t.dateDebut || "",
      Fin: t.echeance || "",
      "Heures prévues": t.heuresPrevues ?? "",
      "Avancement %": t.avancement ?? "",
      Statut: STATUT_LABEL[t.statut] || "À faire",
    }));

  const feuille = XLSX.utils.json_to_sheet(lignes);
  feuille["!cols"] = [
    { wch: 22 }, // ID
    { wch: 26 }, // Chantier
    { wch: 34 }, // Titre
    { wch: 20 }, // Responsable
    { wch: 12 }, // Début
    { wch: 12 }, // Fin
    { wch: 14 }, // Heures prévues
    { wch: 13 }, // Avancement
    { wch: 12 }, // Statut
  ];
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "Tâches");
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(classeur, `taches-${date}.xlsx`);
}

// Relit un classeur exporté (ou modifié) par exporterTachesExcel : ne
// retient que ID + les champs qu'on autorise à réimporter (Début, Fin,
// Heures prévues, Avancement, Statut, Responsable), en ignorant les
// colonnes de simple repère (Chantier, Titre), et ne renvoie que les
// lignes dont au moins un champ a changé par rapport à `taches` (comparaison
// par ID).
export function parseTachesExcel(arrayBuffer, tachesActuelles) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const feuille = workbook.Sheets[workbook.SheetNames[0]];
  const lignes = XLSX.utils.sheet_to_json(feuille, { defval: "" });

  const parId = new Map(tachesActuelles.map((t) => [t.id, t]));
  const modifications = [];
  const idsInconnus = [];
  let lignesAvecId = 0;

  for (const ligne of lignes) {
    const id = String(ligne.ID || "").trim();
    if (!id) continue;
    lignesAvecId += 1;
    const tache = parId.get(id);
    if (!tache) {
      idsInconnus.push(id);
      continue;
    }
    const dateDebut = formatDate(ligne["Début"]) || null;
    const echeance = formatDate(ligne["Fin"]) || null;
    const heuresBrut = ligne["Heures prévues"];
    const heuresPrevues = heuresBrut === "" || heuresBrut === undefined ? null : Number(heuresBrut);
    const avancementBrut = ligne["Avancement %"];
    const avancement =
      avancementBrut === "" || avancementBrut === undefined
        ? null
        : Math.max(0, Math.min(100, Number(avancementBrut)));
    const statutBrut = String(ligne["Statut"] || "").trim().toLowerCase();
    const statut = LABEL_STATUT[statutBrut] || tache.statut || "a_faire";
    // Le responsable est saisi en texte libre séparé par virgules dans la
    // cellule ("Romain DARANCETTE, Julien ETCHEVERRY") — comparé et
    // réimporté sous forme de tableau, comme le fait l'appli.
    const responsableBrut = String(ligne["Responsable"] || "").trim();
    const assigneA = responsableBrut
      ? responsableBrut.split(",").map((n) => n.trim()).filter(Boolean)
      : [];

    const champs = { dateDebut, echeance, heuresPrevues, avancement, statut, assigneA };
    const responsableActuel = normaliserAssignes(tache.assigneA);
    const aChange =
      champs.dateDebut !== (tache.dateDebut || null) ||
      champs.echeance !== (tache.echeance || null) ||
      champs.heuresPrevues !== (tache.heuresPrevues ?? null) ||
      champs.avancement !== (tache.avancement ?? null) ||
      champs.statut !== (tache.statut || "a_faire") ||
      champs.assigneA.join(", ") !== responsableActuel.join(", ");

    if (aChange) {
      modifications.push({ id, titre: tache.titre, champs });
    }
  }

  return { modifications, idsInconnus, lignesAvecId };
}
