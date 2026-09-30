import * as XLSX from "xlsx";
import { RE_CODE, trouverLigneEntete, trouverColonne } from "./parseXlsxCommun";

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
export function analyserMinuteElectricite(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
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

  const texte = (ligne, idx) => (idx >= 0 ? String(ligne[idx] ?? "").trim() : "");
  const nombre = (ligne, idx) => (idx >= 0 ? Number(ligne[idx] ?? 0) || 0 : 0);

  const sequence = [];
  let ordre = 0;
  for (let i = iEntete + 1; i < rows.length; i++) {
    const ligne = rows[i];
    const numero = texte(ligne, c.numero);
    const description = texte(ligne, c.description);
    const nomArticle = texte(ligne, c.nomArticle);
    if (!numero && !description && !nomArticle) continue; // ligne vide

    if (RE_CODE.test(numero)) {
      const profondeur = (numero.match(/\./g) || []).length;
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

    const designationBrute = description || nomArticle;
    if (!designationBrute) continue;
    const [designation, ...reste] = designationBrute
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const detail = reste.join(" ").slice(0, 300);

    const reference = texte(ligne, c.reference);
    const unite = texte(ligne, c.unite);
    const quantite = nombre(ligne, c.quantite);
    const typeFo = texte(ligne, c.typeFo);
    const typeMo = texte(ligne, c.typeMo);
    const tempsUnitaire = nombre(ligne, c.tempsUnitaire);
    const coutUnitaireFo = nombre(ligne, c.coutUnitaireFo);
    const pvUnitaire = nombre(ligne, c.pvUnitaire);

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
      coutTotalFo: c.coutTotalFo >= 0 ? nombre(ligne, c.coutTotalFo) : coutUnitaireFo * quantite,
      typeMo,
      tempsUnitaire,
      tempsTotalHeures:
        c.tempsTotalHeures >= 0 ? nombre(ligne, c.tempsTotalHeures) : tempsUnitaire * quantite,
      pvUnitaire,
      pvTotal: c.pvTotal >= 0 ? nombre(ligne, c.pvTotal) : pvUnitaire * quantite,
      informative,
      ordre: ordre++,
    });
  }

  if (sequence.filter((l) => !l.estPoste).length === 0) {
    throw new Error(
      "Aucune ligne détectée dans ce fichier. Vérifiez qu'il suit bien le modèle de minute de devis (colonnes n°, Référence, Description, Unité, Qté...)."
    );
  }

  return sequence;
}
