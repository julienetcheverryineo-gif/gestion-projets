import * as XLSX from "xlsx";

const STATUTS_LABEL = {
  a_faire: "À acheter", // ancien code, conservé pour compatibilité avec les données existantes
  a_acheter: "À acheter",
  recu: "Reçu",
  installe: "Installé",
  teste: "Testé",
};

// Construit et déclenche le téléchargement d'un classeur Excel listant tout
// le matériel (hors tâches) de tous les chantiers, avec :
// - un onglet "Détail" : une ligne par matériel, avec chantier et équipement
// - un onglet "Récapitulatif achats" : quantités additionnées par
//   désignation + référence, tous chantiers confondus
export function exporterMaterielAchats({
  chantiers,
  regEquipements,
  regItems,
  seulementNonInstalle,
}) {
  const nomChantier = (id) => chantiers.find((c) => c.id === id)?.nom ?? "?";
  const nomEquipement = (id) => regEquipements.find((r) => r.id === id)?.nom ?? "?";
  const chantierDeEquipement = (regId) =>
    regEquipements.find((r) => r.id === regId)?.chantierId ?? null;

  let materiel = regItems.filter((it) => it.type === "materiel");
  if (seulementNonInstalle) {
    // "Non installé" = pas encore acheté (les statuts reçu/installé/testé
    // indiquent que l'achat est déjà fait, inutile de le lister à nouveau)
    materiel = materiel.filter(
      (it) => it.statut !== "recu" && it.statut !== "installe" && it.statut !== "teste"
    );
  }

  const lignesDetail = materiel.map((it) => {
    const chantierId = chantierDeEquipement(it.regEquipementId);
    return {
      Chantier: nomChantier(chantierId),
      Équipement: nomEquipement(it.regEquipementId),
      Désignation: it.designation,
      Quantité: it.quantite || 0,
      Unité: it.unite || "",
      Statut: STATUTS_LABEL[it.statut] || it.statut,
      Remarque: it.remarque || "",
    };
  });

  // Récapitulatif : on regroupe par désignation (le meilleur repère commun,
  // la référence exacte n'étant pas toujours renseignée)
  const groupes = new Map();
  for (const it of materiel) {
    const chantierId = chantierDeEquipement(it.regEquipementId);
    const cle = it.designation.trim().toLowerCase();
    if (!groupes.has(cle)) {
      groupes.set(cle, {
        Désignation: it.designation,
        Quantité: 0,
        Unité: it.unite || "",
        Chantiers: new Set(),
      });
    }
    const g = groupes.get(cle);
    g.Quantité += it.quantite || 0;
    g.Chantiers.add(nomChantier(chantierId));
  }
  const lignesRecap = [...groupes.values()]
    .map((g) => ({
      Désignation: g.Désignation,
      "Quantité totale": g.Quantité,
      Unité: g.Unité,
      Chantiers: [...g.Chantiers].join(", "),
    }))
    .sort((a, b) => a.Désignation.localeCompare(b.Désignation));

  const classeur = XLSX.utils.book_new();
  const feuilleRecap = XLSX.utils.json_to_sheet(lignesRecap);
  const feuilleDetail = XLSX.utils.json_to_sheet(lignesDetail);
  XLSX.utils.book_append_sheet(classeur, feuilleRecap, "Récapitulatif achats");
  XLSX.utils.book_append_sheet(classeur, feuilleDetail, "Détail par chantier");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(classeur, `materiel-achats-${date}.xlsx`);
}
