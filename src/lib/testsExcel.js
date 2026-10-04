import * as XLSX from "xlsx";

export const STATUTS_POINT = [
  { value: "non_teste", label: "Non testé" },
  { value: "ok", label: "OK" },
  { value: "ko", label: "KO" },
  { value: "annule", label: "Annulé" },
];
const STATUT_LABEL = Object.fromEntries(STATUTS_POINT.map((s) => [s.value, s.label]));
const LABEL_STATUT = Object.fromEntries(
  STATUTS_POINT.map((s) => [s.label.toLowerCase(), s.value])
);

// Génère et télécharge un classeur avec une ligne par point de test, pour
// deux usages : imprimer une fiche vierge à remplir à la main sur le
// chantier, ou exporter l'état courant (après des tests déjà faits dans
// l'appli) pour archivage/envoi au client. Seuls Statut/Valeur mesurée/
// Commentaire sont réinjectés à l'import (voir parseTestsExcel) ; les
// autres colonnes ne servent que de repère.
export function exporterTestsExcel(points, equipements, nomChantier) {
  const nomEquipement = (id) => equipements.find((e) => e.id === id)?.nom || "";
  const lignes = points.map((p) => ({
    ID: p.id,
    Équipement: nomEquipement(p.testEquipementId),
    Repère: p.repere || "",
    Désignation: p.designation || "",
    Type: p.type || "",
    Statut: STATUT_LABEL[p.statut] || STATUT_LABEL.non_teste,
    "Valeur mesurée": p.valeurMesuree || "",
    Commentaire: p.commentaire || "",
    "Testé par": p.testePar || "",
  }));

  const feuille = XLSX.utils.json_to_sheet(lignes);
  feuille["!cols"] = [
    { wch: 22 }, // ID
    { wch: 24 }, // Équipement
    { wch: 12 }, // Repère
    { wch: 32 }, // Désignation
    { wch: 10 }, // Type
    { wch: 12 }, // Statut
    { wch: 16 }, // Valeur mesurée
    { wch: 30 }, // Commentaire
    { wch: 18 }, // Testé par
  ];
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "Tests");
  const date = new Date().toISOString().slice(0, 10);
  const nomFichier = (nomChantier ? "tests-" + nomChantier + "-" : "tests-") + date + ".xlsx";
  XLSX.writeFile(classeur, nomFichier.replace(/[^\w.-]+/g, "_"));
}

// Relit un classeur exporté (ou rempli à la main depuis un modèle vierge)
// par exporterTestsExcel : ne retient que ID + Statut/Valeur mesurée/
// Commentaire, et ne renvoie que les lignes dont au moins un de ces champs
// a changé par rapport à `pointsActuels` (comparaison par ID). Le "Testé
// par" est renseigné par l'appli à l'import (utilisateur connecté), pas
// recopié depuis le fichier.
export function parseTestsExcel(arrayBuffer, pointsActuels) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const feuille = workbook.Sheets[workbook.SheetNames[0]];
  const lignes = XLSX.utils.sheet_to_json(feuille, { defval: "" });

  const parId = new Map(pointsActuels.map((p) => [p.id, p]));
  const modifications = [];
  const idsInconnus = [];
  let lignesAvecId = 0;

  for (const ligne of lignes) {
    const id = String(ligne.ID || "").trim();
    if (!id) continue;
    lignesAvecId += 1;
    const point = parId.get(id);
    if (!point) {
      idsInconnus.push(id);
      continue;
    }
    const statutBrut = String(ligne.Statut || "").trim().toLowerCase();
    const statut = LABEL_STATUT[statutBrut] || point.statut || "non_teste";
    const valeurMesuree = String(ligne["Valeur mesurée"] || "").trim();
    const commentaire = String(ligne.Commentaire || "").trim();

    const aChange =
      statut !== (point.statut || "non_teste") ||
      valeurMesuree !== (point.valeurMesuree || "") ||
      commentaire !== (point.commentaire || "");

    if (aChange) {
      modifications.push({ id, repere: point.repere, champs: { statut, valeurMesuree, commentaire } });
    }
  }

  return { modifications, idsInconnus, lignesAvecId };
}

function nomEquipementPoint(point, equipements) {
  return point.equipement || equipements.find((e) => e.id === point.testEquipementId)?.nom || "";
}

function formatDateTest(valeur) {
  if (!valeur?.toDate) return "";
  return valeur.toDate().toLocaleDateString("fr-FR");
}

// Compte-rendu de tests à remettre au client/BE : repris dans le même
// esprit que le fichier "Listing des points et équipements" (une page de
// garde avec les infos du projet, puis un tableau détaillé groupé par
// bâtiment/niveau/équipement), mais avec le résultat de chaque test plutôt
// que les colonnes TA/TS/TM/TC/TR.
export function genererCompteRenduTests(points, equipements, chantier, nomEditeur) {
  const nbOk = points.filter((p) => p.statut === "ok").length;
  const nbKo = points.filter((p) => p.statut === "ko").length;
  const nbAnnules = points.filter((p) => p.statut === "annule").length;
  const nbNonTestes = points.length - nbOk - nbKo - nbAnnules;
  const date = new Date().toLocaleDateString("fr-FR");

  const garde = [
    [],
    [],
    ["", "Compte-rendu de tests"],
    [],
    ["", "Chantier", "", chantier?.nom || ""],
    ["", "Client", "", chantier?.client || ""],
    ["", "Date d'édition", "", date],
    ["", "Édité par", "", nomEditeur || ""],
    [],
    ["", "Résultats"],
    ["", "Nombre de points", "", points.length],
    ["", "OK", "", nbOk],
    ["", "KO", "", nbKo],
    ["", "Annulés", "", nbAnnules],
    ["", "Non testés", "", nbNonTestes],
  ];
  const feuilleGarde = XLSX.utils.aoa_to_sheet(garde);
  feuilleGarde["!cols"] = [{ wch: 3 }, { wch: 22 }, { wch: 3 }, { wch: 40 }];

  const tries = [...points].sort((a, b) => {
    const cle = (p) =>
      [p.batiment || "", p.niveau || "", nomEquipementPoint(p, equipements), p.sousEquipement || "", p.repere || ""]
        .join("|")
        .toLowerCase();
    return cle(a).localeCompare(cle(b), "fr");
  });

  const lignes = tries.map((p) => ({
    Bâtiment: p.batiment || "",
    Niveau: p.niveau || "",
    Équipement: nomEquipementPoint(p, equipements),
    "Sous-équipement": p.sousEquipement || "",
    Repère: p.repere || "",
    Désignation: p.designation || "",
    Type: p.typeImport || p.type || "",
    Statut: STATUT_LABEL[p.statut] || STATUT_LABEL.non_teste,
    "Valeur mesurée": p.valeurMesuree || "",
    Commentaire: p.commentaire || "",
    "Testé par": p.testePar || "",
    Date: formatDateTest(p.testeLe),
  }));
  const feuilleTests = XLSX.utils.json_to_sheet(lignes);
  feuilleTests["!cols"] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 26 },
    { wch: 20 },
    { wch: 16 },
    { wch: 32 },
    { wch: 8 },
    { wch: 12 },
    { wch: 16 },
    { wch: 30 },
    { wch: 16 },
    { wch: 14 },
  ];

  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuilleGarde, "Page de garde");
  XLSX.utils.book_append_sheet(classeur, feuilleTests, "Tests");
  const nomFichier =
    "compte-rendu-tests-" + (chantier?.nom || "chantier") + "-" + new Date().toISOString().slice(0, 10) + ".xlsx";
  XLSX.writeFile(classeur, nomFichier.replace(/[^\w.-]+/g, "_"));
}
