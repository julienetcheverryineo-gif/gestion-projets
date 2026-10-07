import * as XLSX from "xlsx";
import { RE_CODE, trouverLigneEntete, trouverColonne } from "./parseXlsxCommun";

// Désignation affichée pour une ligne de la minute qui n'en a pas.
export const DESIGNATION_VIDE = "LIGNE SANS DESIGNATION";

const LABELS = {
  numero: ["n°", "no"],
  reference: ["référence", "reference"],
  description: ["description"],
  nomArticle: ["nom de l'article", "nom de l article"],
  unite: ["unité", "unite"],
  quantite: ["qté", "qte", "quantité", "quantite"],
  typeFo: ["type de fo"],
  typeMo: ["type mo", "type de mo"],
  tempsUnitaire: ["temps unitaire"],
  coutUnitaireFo: ["coût unitaire", "cout unitaire"],
  coutTotalFo: ["coût total fo (eur)", "cout total fo (eur)"],
  tempsTotalHeures: ["temps total (heure)"],
  pvUnitaire: ["pv unitaire"],
  pvTotal: ["pv total"],
};

// Lit une minute de devis (même modèle que l'Automatisme : colonnes n°,
// Référence, Description, Unité, Qté, Type de FO, Type MO, Temps
// unitaire..., avec ou sans les colonnes de chiffrage complètes) et
// produit une séquence PLATE (postes + lignes), dans l'ordre du fichier,
// avec la profondeur de chaque poste.
//
// Contrairement à l'import Automatisme (qui regroupe les lignes en
// équipements régulés), on garde ici la structure telle quelle : c'est
// cette même structure, ligne par ligne, que le suivi d'exécution du
// service Électricité renseigne avec un % d'avancement par ligne.
// Niveau de gris (0-255) de la couleur de fond d'une cellule, ou null si la
// cellule n'a pas de fond gris (blanc, couleur, absent). Sert à repérer les
// regroupements de la minute : une ligne gris foncé suivie de lignes gris
// plus clair.
function niveauGris(cellule) {
  const rgb = cellule?.s?.patternType === "solid" ? cellule.s.fgColor?.rgb : null;
  if (!rgb || !/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(rgb)) return null;
  const hex = rgb.slice(-6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  if (Math.max(r, g, b) - Math.min(r, g, b) > 4) return null;
  return r >= 0xf4 ? null : r;
}

// Repère les regroupements : une ligne d'article gris foncé suivie
// immédiatement de lignes gris plus clair forme un groupe (la ligne foncée
// en est la tête). Marque chaque ligne concernée avec groupeCle (n° du
// groupe dans le fichier) et groupeTete (true pour la ligne foncée).
function reperGroupes(sequence) {
  let cle = 0;
  for (let i = 0; i < sequence.length; i++) {
    const tete = sequence[i];
    if (tete.estPoste || tete.gris == null) continue;
    let j = i + 1;
    while (j < sequence.length && !sequence[j].estPoste && sequence[j].gris != null && sequence[j].gris > tete.gris) j++;
    if (j > i + 1) {
      cle += 1;
      tete.groupeCle = cle;
      tete.groupeTete = true;
      for (let k = i + 1; k < j; k++) sequence[k].groupeCle = cle;
      i = j - 1;
    }
  }
  sequence.forEach((l) => delete l.gris);
}

export function analyserMinuteElectricite(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellStyles: true });
  const feuille = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(feuille, { header: 1, defval: "" });
  const iEntete = trouverLigneEntete(rows, LABELS.numero);
  if (iEntete === -1) {
    throw new Error(
      "Impossible de détecter l'en-tête du tableau (colonne « n° » introuvable)."
    );
  }
  const entete = rows[iEntete];
  const col = (cles) => trouverColonne(entete, cles);
  const c = {
    numero: col(LABELS.numero),
    reference: col(LABELS.reference),
    description: col(LABELS.description),
    nomArticle: col(LABELS.nomArticle),
    unite: col(LABELS.unite),
    quantite: col(LABELS.quantite),
    typeFo: col(LABELS.typeFo),
    typeMo: col(LABELS.typeMo),
    tempsUnitaire: col(LABELS.tempsUnitaire),
    coutUnitaireFo: col(LABELS.coutUnitaireFo),
    coutTotalFo: col(LABELS.coutTotalFo),
    tempsTotalHeures: col(LABELS.tempsTotalHeures),
    pvUnitaire: col(LABELS.pvUnitaire),
    pvTotal: col(LABELS.pvTotal),
  };

  const ligneDepart = XLSX.utils.decode_range(feuille["!ref"] || "A1").s.r;
  const grisDeLigne = (i) => {
    for (const idx of [c.description, c.numero, c.nomArticle]) {
      if (idx == null || idx < 0) continue;
      const g = niveauGris(feuille[XLSX.utils.encode_cell({ r: ligneDepart + i, c: idx })]);
      if (g != null) return g;
    }
    return null;
  };

  const texte = (ligne, idx) => (idx >= 0 ? String(ligne[idx] ?? "").trim() : "");
  const nombre = (ligne, idx) => (idx >= 0 ? Number(ligne[idx] ?? 0) || 0 : 0);

  const sequence = [];
  let ordre = 0;
  // Quantité de chaque poste ouvert, par niveau (principal, secondaire...).
  // Les montants et heures des lignes du fichier sont pour UNE unité du
  // poste : on les multiplie par le produit des quantités des postes
  // parents (ex. poste secondaire x3 dans un principal x2 -> x6).
  const quantitesPostes = [];
  for (let i = iEntete + 1; i < rows.length; i++) {
    const ligne = rows[i];
    const numero = texte(ligne, c.numero);
    const description = texte(ligne, c.description);
    const nomArticle = texte(ligne, c.nomArticle);
    if (!numero && !description && !nomArticle) continue; // ligne vide

    if (RE_CODE.test(numero)) {
      const profondeur = (numero.match(/\./g) || []).length;
      const quantitePoste = nombre(ligne, c.quantite);
      quantitesPostes[profondeur] = quantitePoste > 0 ? quantitePoste : 1;
      quantitesPostes.length = profondeur + 1;
      sequence.push({
        estPoste: true,
        code: numero,
        profondeur,
        designation: description || nomArticle || numero,
        ordre: ordre++,
      });
      continue;
    }
    if (/^totaux pour le poste/i.test(description)) continue;

    const reference = texte(ligne, c.reference);
    const unite = texte(ligne, c.unite);
    const quantite = nombre(ligne, c.quantite);
    const typeFo = texte(ligne, c.typeFo);
    const typeMo = texte(ligne, c.typeMo);
    const tempsUnitaire = nombre(ligne, c.tempsUnitaire);
    const coutUnitaireFo = nombre(ligne, c.coutUnitaireFo);
    const pvUnitaire = nombre(ligne, c.pvUnitaire);
    const facteurPoste = quantitesPostes.reduce((p, q) => p * (q || 1), 1);

    // Ligne sans description : on l'importe quand même si elle porte une
    // vraie information (unité, référence, quantité ou montant non nuls),
    // en la marquant explicitement, pour qu'elle ne disparaisse pas
    // silencieusement du suivi. Une ligne numérotée mais entièrement vide
    // (simple trou de numérotation, tout à 0) reste ignorée.
    const sansDesignation =
      !description &&
      !nomArticle &&
      Boolean(reference || unite || quantite || tempsUnitaire || coutUnitaireFo || pvUnitaire);
    if (!description && !nomArticle && !sansDesignation) continue;
    const designationBrute = description || nomArticle || DESIGNATION_VIDE;
    const [designation, ...reste] = designationBrute
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const detail = reste.join(" ").slice(0, 300);

    // Ligne purement informative (ex: "Barattage :", un sous-titre, ou le
    // titre du devis en première ligne) : repérée par l'absence d'unité
    // ET de toute valeur chiffrée — une ligne d'article réelle a toujours
    // au moins une unité, même quand sa quantité vaut 1 par défaut.
    // Gardée comme repère visuel, mais sans avancement à suivre dessus.
    const informative =
      !reference && !unite && !typeFo && !typeMo && !tempsUnitaire && !coutUnitaireFo && !pvUnitaire;

    sequence.push({
      estPoste: false,
      code: numero,
      designation: designation || "",
      detail,
      reference,
      unite,
      quantite,
      typeFo,
      coutUnitaireFo,
      facteurPoste,
      coutTotalFo: (c.coutTotalFo >= 0 ? nombre(ligne, c.coutTotalFo) : coutUnitaireFo * quantite) * facteurPoste,
      typeMo,
      tempsUnitaire,
      tempsTotalHeures:
        (c.tempsTotalHeures >= 0 ? nombre(ligne, c.tempsTotalHeures) : tempsUnitaire * quantite) * facteurPoste,
      pvUnitaire,
      pvTotal: (c.pvTotal >= 0 ? nombre(ligne, c.pvTotal) : pvUnitaire * quantite) * facteurPoste,
      informative,
      sansDesignation,
      gris: grisDeLigne(i),
      ordre: ordre++,
    });
  }

  if (sequence.filter((l) => !l.estPoste).length === 0) {
    throw new Error(
      "Aucune ligne détectée dans ce fichier. Vérifiez qu'il suit bien le modèle de minute de devis (colonnes n°, Référence, Description, Unité, Qté...)."
    );
  }

  reperGroupes(sequence);
  return sequence;
}
