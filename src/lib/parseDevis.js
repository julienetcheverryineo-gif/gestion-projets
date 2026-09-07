import * as XLSX from "xlsx";

// Un "code" de poste : lettres, puis zéro ou plusieurs groupes ".chiffres".
// Exemples : "A" (profondeur 0), "A.1" (profondeur 1), "A.1.1" (profondeur 2)
const RE_CODE = /^[A-Za-z]+(\.\d+)*$/;

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

// Étape 1 : lit le classeur et produit une séquence plate de lignes
// (repères de poste à leur profondeur + lignes de matériel/tâche déjà
// classées), ainsi que la liste des profondeurs de repère rencontrées avec
// un exemple, pour que l'utilisateur choisisse le bon niveau de regroupement.
export function analyserClasseur(arrayBuffer) {
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

  const sequence = [];
  const niveaux = new Map(); // profondeur -> { profondeur, exemple, count }
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

    if (RE_CODE.test(numero)) {
      const profondeur = (numero.match(/\./g) || []).length;
      sequence.push({ estCode: true, profondeur, code: numero, nom: description || numero });
      if (!niveaux.has(profondeur)) {
        niveaux.set(profondeur, { profondeur, exemple: description || numero, count: 0 });
      }
      niveaux.get(profondeur).count += 1;
      continue;
    }

    if (/^totaux pour le poste/i.test(description)) {
      continue; // ligne de total
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

    const detail = resteDescription.join(" ").slice(0, 200);

    // Règle métier : un code en "Type de FO" signale du matériel ; un code
    // en "Type MO" signale une tâche. Les deux à la fois → une ligne de
    // chaque.
    if (typeFo) {
      compteur += 1;
      sequence.push({
        estCode: false,
        id: "tmp-" + compteur,
        type: "materiel",
        designation,
        reference,
        unite,
        quantite,
        detail,
      });
    }
    if (typeMo) {
      compteur += 1;
      sequence.push({
        estCode: false,
        id: "tmp-" + compteur,
        type: "tache",
        designation,
        reference: "",
        unite: "",
        quantite: 0,
        detail: "",
      });
    } else if (!typeFo) {
      // Ni Type de FO ni Type MO : on ne perd pas la ligne, on la classe
      // par défaut selon la présence d'une référence.
      compteur += 1;
      sequence.push({
        estCode: false,
        id: "tmp-" + compteur,
        type: reference ? "materiel" : "tache",
        designation,
        reference,
        unite,
        quantite,
        detail,
      });
    }
  }

  return {
    sequence,
    niveaux: [...niveaux.values()].sort((a, b) => a.profondeur - b.profondeur),
  };
}

// Étape 2 : regroupe la séquence en équipements, en utilisant les repères de
// la profondeur choisie comme limite d'équipement. Les repères plus profonds
// (sous-groupes comme "Fourniture et programmation") sont ignorés en tant
// que titres, et leurs lignes rattachées à l'équipement en cours.
export function grouperParProfondeur(sequence, profondeurChoisie) {
  const postes = [];
  let posteCourant = null;

  for (const item of sequence) {
    if (item.estCode) {
      if (item.profondeur === profondeurChoisie) {
        posteCourant = { code: item.code, nom: item.nom, items: [] };
        postes.push(posteCourant);
      }
      continue;
    }
    if (!posteCourant) continue;
    posteCourant.items.push(item);
  }

  return postes.filter((p) => p.items.length > 0);
}

// Compatibilité : lit directement et regroupe à la profondeur la plus
// courante quand un seul niveau existe dans le fichier.
export function parseDevisWorkbook(arrayBuffer) {
  const { sequence, niveaux } = analyserClasseur(arrayBuffer);
  if (niveaux.length === 0) return [];
  const profondeur = niveaux[niveaux.length - 1].profondeur;
  return grouperParProfondeur(sequence, profondeur);
}
