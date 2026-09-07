import * as XLSX from "xlsx";

// Motif d'un code de poste : une ou plusieurs lettres, un point, un chiffre.
// Exemples : "A.1", "B.12"
const RE_POSTE = /^[A-Za-z]+\.\d+/;

const LABELS = {
  numero: ["n°", "no"],
  reference: ["référence", "reference"],
  description: ["description"],
  nomArticle: ["nom de l'article", "nom de l article"],
  unite: ["unité", "unite"],
  quantite: ["qté", "qte", "quantité", "quantite"],
  typeFo: ["type de fo"],
  typeMo: ["type mo", "type de mo"],
};

function normaliser(texte) {
  return String(texte ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function trouverLigneEntete(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const ligne = rows[i].map(normaliser);
    if (ligne.some((c) => LABELS.numero.includes(c))) {
      return i;
    }
  }
  return -1;
}

function trouverColonne(entete, cles) {
  const normalisee = entete.map(normaliser);
  for (let c = 0; c < normalisee.length; c++) {
    if (cles.some((cle) => normalisee[c] === cle)) return c;
  }
  return -1;
}

// Lit un classeur Excel (ArrayBuffer) et retourne la liste des postes détectés
// ("équipements régulés"), chacun avec son matériel et ses tâches.
export function parseDevisWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const feuille = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(feuille, { header: 1, defval: "" });

  const iEntete = trouverLigneEntete(rows);
  if (iEntete === -1) {
    throw new Error(
      "Impossible de détecter l'en-tête du tableau (colonne « n° » introuvable)."
    );
  }
  const entete = rows[iEntete];
  const cNumero = trouverColonne(entete, LABELS.numero);
  const cReference = trouverColonne(entete, LABELS.reference);
  const cDescription = trouverColonne(entete, LABELS.description);
  const cNomArticle = trouverColonne(entete, LABELS.nomArticle);
  const cUnite = trouverColonne(entete, LABELS.unite);
  const cQuantite = trouverColonne(entete, LABELS.quantite);
  const cTypeFo = trouverColonne(entete, LABELS.typeFo);
  const cTypeMo = trouverColonne(entete, LABELS.typeMo);

  const postes = [];
  let posteCourant = null;
  let compteur = 0;

  for (let i = iEntete + 1; i < rows.length; i++) {
    const ligne = rows[i];
    const numero = String(ligne[cNumero] ?? "").trim();
    const description = String(ligne[cDescription] ?? "").trim();
    const nomArticle = cNomArticle >= 0 ? String(ligne[cNomArticle] ?? "").trim() : "";
    const reference = cReference >= 0 ? String(ligne[cReference] ?? "").trim() : "";
    const unite = cUnite >= 0 ? String(ligne[cUnite] ?? "").trim() : "";
    const quantite = cQuantite >= 0 ? Number(ligne[cQuantite] ?? 0) || 0 : 0;
    const typeFo = cTypeFo >= 0 ? String(ligne[cTypeFo] ?? "").trim() : "";
    const typeMo = cTypeMo >= 0 ? String(ligne[cTypeMo] ?? "").trim() : "";

    if (!numero && !description) continue; // ligne vide

    if (RE_POSTE.test(numero)) {
      // Nouveau poste = un équipement régulé (ex: "A.1  LOCAL RCU")
      posteCourant = {
        code: numero,
        nom: description || numero,
        items: [],
      };
      postes.push(posteCourant);
      continue;
    }

    if (!posteCourant) continue; // ligne avant le premier poste, on ignore

    if (/^totaux pour le poste/i.test(description)) {
      continue; // ligne de total, fin de poste
    }

    const designationBrute = description || nomArticle;
    if (!designationBrute) continue;
    const [designation, ...resteDescription] = designationBrute
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const estSousTitre = !reference && !unite && !quantite && !typeFo && !typeMo;
    if (estSousTitre) {
      continue; // sous-section informative (ex: "AUTOMATE") : pas une ligne à importer
    }

    // Règle métier : un code en "Type de FO" signale du matériel ; à défaut,
    // un code en "Type MO" (main d'œuvre) signale une tâche.
    const type = typeFo ? "materiel" : typeMo ? "tache" : reference ? "materiel" : "tache";

    compteur += 1;
    posteCourant.items.push({
      id: "tmp-" + compteur,
      type,
      designation,
      reference,
      unite,
      quantite,
      detail: resteDescription.join(" ").slice(0, 200),
    });
  }

  return postes.filter((p) => p.items.length > 0);
}
