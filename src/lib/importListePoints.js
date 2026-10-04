import * as XLSX from "xlsx";

// Lit un fichier "Listing des points et équipements" (modèle utilisé pour
// décrire les entrées/sorties d'une installation GTB avant chiffrage/
// réalisation) et le transforme en équipements de test + points, prêts à
// être importés dans les collections testEquipements/testPoints (voir
// TestsPanel.jsx et ListePointsPanel.jsx).
//
// Le modèle : une ligne par point, groupée visuellement par bâtiment/
// niveau/équipement/sous-équipement, avec une colonne à cocher (une
// valeur non vide) par type de voie (TA/TS/TM/TC/TR/Impulsionnel/MODBUS/
// Mbus). On repère les en-têtes par leur texte plutôt que par leur lettre
// de colonne, pour rester robuste si l'ordre des colonnes change d'un
// chantier à l'autre — seul le texte "Nom du point" doit être présent
// pour qu'on retrouve la ligne d'en-têtes.
const NOM_FEUILLE_PAR_DEFAUT = "ListePoints";

// Type de voie (texte de l'en-tête, recherché sans tenir compte de la
// casse) -> type de test normalisé utilisé par l'onglet Tests.
const COLONNES_TYPE = [
  { entete: "TA", type: "DI" },
  { entete: "TS", type: "DI" },
  { entete: "TC", type: "DO" },
  { entete: "TM", type: "AI" },
  { entete: "TR", type: "AO" },
  { entete: "Impulsionnel", type: "AI" },
  { entete: "MODBUS", type: "autre" },
  { entete: "Mbus", type: "autre" },
];

function normaliser(valeur) {
  if (valeur instanceof Date) return valeur.toLocaleDateString("fr-FR");
  return String(valeur ?? "").trim();
}

function trouverLigneEntete(lignes) {
  return lignes.findIndex((ligne) =>
    ligne.some((c) => normaliser(c).toLowerCase() === "nom du point")
  );
}

// Index de toutes les colonnes dont l'en-tête correspond exactement au
// texte recherché (il peut y en avoir plusieurs : "Date"/"Qui" apparaissent
// deux fois — une fois pour le câblage, une fois pour la GTC).
function indexColonnes(enteteLigne, recherche) {
  const cible = recherche.toLowerCase();
  const index = [];
  enteteLigne.forEach((c, i) => {
    if (normaliser(c).toLowerCase() === cible) index.push(i);
  });
  return index;
}

export function analyserListePoints(arrayBuffer) {
  const classeur = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const nomFeuille = classeur.SheetNames.includes(NOM_FEUILLE_PAR_DEFAUT)
    ? NOM_FEUILLE_PAR_DEFAUT
    : classeur.SheetNames[0];
  const feuille = classeur.Sheets[nomFeuille];
  const lignes = XLSX.utils.sheet_to_json(feuille, { header: 1, defval: "" });

  const indexEntete = trouverLigneEntete(lignes);
  if (indexEntete === -1) {
    return {
      erreur:
        "Colonne « Nom du point » introuvable dans la feuille « " + nomFeuille + " ».",
    };
  }
  const entete = lignes[indexEntete];
  const col = (nom) => {
    const idx = indexColonnes(entete, nom);
    return idx.length > 0 ? idx[0] : -1;
  };

  const colBatiment = col("Batiment") !== -1 ? col("Batiment") : col("Bâtiment");
  const colNiveau = col("Niveau");
  const colEquipement = col("Équipement") !== -1 ? col("Équipement") : col("Equipement");
  const colSousEquipement =
    col("Sous-équipement") !== -1 ? col("Sous-équipement") : col("Sous-equipement");
  const colAdresse = col("Adresse");
  const colNomPoint = col("Nom du point");
  const colTagAutomate = col("Tag automate");
  const colEntreprise = col("Entreprise");
  const colCommentaires = col("Commentaires");
  const colSupprime = col("supprimé") !== -1 ? col("supprimé") : col("supprime");

  const colsDate = indexColonnes(entete, "Date");
  const colsQui = indexColonnes(entete, "Qui");
  const colCablageDate = colsDate.length > 0 ? colsDate[0] : -1;
  const colCablageQui = colsQui.length > 0 ? colsQui[0] : -1;
  const colGtcDate = colsDate.length > 1 ? colsDate[1] : -1;
  const colGtcQui = colsQui.length > 1 ? colsQui[1] : -1;

  const colonnesType = COLONNES_TYPE.map((c) => ({ ...c, index: col(c.entete) })).filter(
    (c) => c.index !== -1
  );

  const lire = (ligne, index) => (index !== -1 ? normaliser(ligne[index]) : "");

  const groupes = new Map(); // "batiment|niveau|equipement" -> { batiment, niveau, equipement, nom, points }
  let nbIgnores = 0;

  for (let i = indexEntete + 1; i < lignes.length; i++) {
    const ligne = lignes[i];
    const nomPoint = lire(ligne, colNomPoint);
    const equipement = lire(ligne, colEquipement);
    if (!nomPoint && !equipement) continue; // ligne vide
    if (colSupprime !== -1 && lire(ligne, colSupprime)) {
      nbIgnores += 1;
      continue;
    }
    if (!equipement) {
      nbIgnores += 1; // impossible de grouper un point sans équipement
      continue;
    }

    const batiment = lire(ligne, colBatiment);
    const niveau = lire(ligne, colNiveau);
    const cleGroupe = batiment + "|" + niveau + "|" + equipement;
    if (!groupes.has(cleGroupe)) {
      groupes.set(cleGroupe, {
        batiment,
        niveau,
        equipement,
        nom: [batiment, niveau, equipement].filter(Boolean).join(" — "),
        points: [],
      });
    }

    let type = "autre";
    let typeImport = "";
    for (const c of colonnesType) {
      if (lire(ligne, c.index)) {
        type = c.type;
        typeImport = c.entete;
        break;
      }
    }

    const adresse = lire(ligne, colAdresse);
    const repere = lire(ligne, colTagAutomate) || adresse;

    groupes.get(cleGroupe).points.push({
      repere,
      designation: nomPoint,
      type,
      typeImport,
      batiment,
      niveau,
      equipement,
      sousEquipement: lire(ligne, colSousEquipement),
      adresse,
      entreprise: lire(ligne, colEntreprise),
      commentaireImport: lire(ligne, colCommentaires),
      cablageDate: lire(ligne, colCablageDate),
      cablageQui: lire(ligne, colCablageQui),
      gtcDate: lire(ligne, colGtcDate),
      gtcQui: lire(ligne, colGtcQui),
    });
  }

  const equipementsGroupes = Array.from(groupes.values());
  const nbPoints = equipementsGroupes.reduce((n, g) => n + g.points.length, 0);
  return { nomFeuille, equipementsGroupes, nbPoints, nbIgnores };
}
