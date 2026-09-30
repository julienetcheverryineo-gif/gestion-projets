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
};

// Construit la ou les lignes d'article (matériel/tâche) à partir d'une
// ligne brute du tableau. Une ligne qui a à la fois un code Type de FO et un
// code Type MO génère une ligne de matériel ET une ligne de tâche.
function construireLignesArticle(donnees, compteurRef) {
  const { description, nomArticle, reference, unite, quantite, typeFo, typeMo, tempsUnitaire } =
    donnees;

  const designationBrute = description || nomArticle;
  if (!designationBrute) return [];
  const [designationOrigine, ...resteDescription] = designationBrute
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const estSousTitre =
    !reference && !unite && !quantite && !typeFo && !typeMo && !tempsUnitaire;
  if (estSousTitre) return []; // sous-section informative (ex: "AUTOMATE")

  const detailOrigine = resteDescription.join(" ").slice(0, 200);
  const resultats = [];

  // Heures prévues d'une tâche = temps unitaire (colonne "Temps unitaire")
  // multiplié par la quantité de la ligne (ex: 4h × 4 occurrences = 16h).
  const heuresTache = tempsUnitaire ? tempsUnitaire * (quantite || 1) : null;

  // Pour du matériel : la référence (ex: "ECY-16DI") est plus utile comme
  // désignation principale que la description générique du devis. Quand
  // elle existe, on l'utilise comme désignation et on relègue la
  // description d'origine en remarque (detail).
  const champsMateriel = () =>
    reference
      ? {
          designation: reference,
          detail: [designationOrigine, detailOrigine].filter(Boolean).join(" — "),
        }
      : { designation: designationOrigine, detail: detailOrigine };

  if (typeFo) {
    compteurRef.n += 1;
    resultats.push({
      estCode: false,
      id: "tmp-" + compteurRef.n,
      type: "materiel",
      ...champsMateriel(),
      reference,
      unite,
      quantite,
    });
  }
  if (typeMo) {
    compteurRef.n += 1;
    resultats.push({
      estCode: false,
      id: "tmp-" + compteurRef.n,
      type: "tache",
      designation: designationOrigine,
      reference: "",
      unite: "",
      quantite: 0,
      detail: "",
      heuresPrevues: heuresTache,
    });
  } else if (!typeFo) {
    compteurRef.n += 1;
    const estMateriel = Boolean(reference);
    resultats.push({
      estCode: false,
      id: "tmp-" + compteurRef.n,
      type: estMateriel ? "materiel" : "tache",
      ...(estMateriel
        ? champsMateriel()
        : { designation: designationOrigine, detail: detailOrigine }),
      reference,
      unite,
      quantite,
      heuresPrevues: estMateriel ? undefined : heuresTache,
    });
  }

  return resultats;
}

// Étape 1 : lit le classeur et produit une séquence plate de lignes
// (repères de poste à leur profondeur + lignes de matériel/tâche déjà
// classées), ainsi que la liste des profondeurs de repère rencontrées avec
// un exemple, pour que l'utilisateur choisisse le bon niveau de regroupement.
//
// Deux formats de repérage des postes sont reconnus :
// 1. Codes lettrés hiérarchiques dans la colonne n° (ex: "A", "A.1", "A.1.1")
// 2. À défaut d'aucun code lettré dans tout le fichier : des lignes-titres
//    (n° vide, juste une description) délimitées par des lignes
//    "Totaux pour le poste :". Une ou deux lignes-titres consécutives avant
//    le début des articles jouent le même rôle que les niveaux de codes.
export function analyserClasseur(arrayBuffer) {
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
  const cNumero = trouverColonne(entete, LABELS.numero);
  const cReference = trouverColonne(entete, LABELS.reference);
  const cDescription = trouverColonne(entete, LABELS.description);
  const cNomArticle = trouverColonne(entete, LABELS.nomArticle);
  const cUnite = trouverColonne(entete, LABELS.unite);
  const cQuantite = trouverColonne(entete, LABELS.quantite);
  const cTypeFo = trouverColonne(entete, LABELS.typeFo);
  const cTypeMo = trouverColonne(entete, LABELS.typeMo);
  const cTempsUnitaire = trouverColonne(entete, LABELS.tempsUnitaire);

  // Lecture brute de toutes les lignes de données une seule fois.
  const lignesBrutes = [];
  for (let i = iEntete + 1; i < rows.length; i++) {
    const ligne = rows[i];
    const numero = String(ligne[cNumero] ?? "").trim();
    const description = String(ligne[cDescription] ?? "").trim();
    if (!numero && !description) continue; // ligne vide
    lignesBrutes.push({
      numero,
      description,
      nomArticle: cNomArticle >= 0 ? String(ligne[cNomArticle] ?? "").trim() : "",
      reference: cReference >= 0 ? String(ligne[cReference] ?? "").trim() : "",
      unite: cUnite >= 0 ? String(ligne[cUnite] ?? "").trim() : "",
      quantite: cQuantite >= 0 ? Number(ligne[cQuantite] ?? 0) || 0 : 0,
      typeFo: cTypeFo >= 0 ? String(ligne[cTypeFo] ?? "").trim() : "",
      typeMo: cTypeMo >= 0 ? String(ligne[cTypeMo] ?? "").trim() : "",
      tempsUnitaire: cTempsUnitaire >= 0 ? Number(ligne[cTempsUnitaire] ?? 0) || 0 : 0,
    });
  }

  const utiliseCodesLettres = lignesBrutes.some((l) => RE_CODE.test(l.numero));

  if (utiliseCodesLettres) {
    const sequence = [];
    const niveaux = new Map();
    const compteurRef = { n: 0 };
    const ajouterNiveau = (profondeur, nom) => {
      if (!niveaux.has(profondeur)) {
        niveaux.set(profondeur, { profondeur, exemple: nom, count: 0 });
      }
      niveaux.get(profondeur).count += 1;
    };
    for (const l of lignesBrutes) {
      if (RE_CODE.test(l.numero)) {
        const profondeur = (l.numero.match(/\./g) || []).length;
        const nom = l.description || l.numero;
        sequence.push({ estCode: true, profondeur, code: l.numero, nom, quantite: l.quantite });
        ajouterNiveau(profondeur, nom);
        continue;
      }
      if (/^totaux pour le poste/i.test(l.description)) continue;
      sequence.push(...construireLignesArticle(l, compteurRef));
    }
    return {
      sequence,
      niveaux: [...niveaux.values()].sort((a, b) => a.profondeur - b.profondeur),
      postesDirects: null,
    };
  }

  // Format sans codes lettrés : chaque poste est délimité par une ligne
  // "Totaux pour le poste :" et nommé par le fil d'Ariane de ses lignes-titres
  // (n° vide) qui le précèdent directement. Comme le nombre de niveaux de
  // titre peut varier d'un poste à l'autre dans le même fichier (parfois 1,
  // parfois 2), chaque poste est construit directement plutôt que via une
  // profondeur unique choisie globalement — ça évite de mélanger les
  // articles de postes voisins de profondeurs différentes.
  const postesDirects = [];
  const compteurRef = { n: 0 };
  let filAriane = [];
  let posteCourant = null;
  for (const l of lignesBrutes) {
    if (/^totaux pour le poste/i.test(l.description)) {
      filAriane = [];
      posteCourant = null;
      continue;
    }
    if (!l.numero && l.description) {
      filAriane.push(l.description);
      posteCourant = {
        code: "",
        nom: filAriane.join(" - "),
        facteur: l.quantite > 1 ? l.quantite : 1,
        items: [],
      };
      postesDirects.push(posteCourant);
      continue;
    }
    if (!posteCourant) continue;
    posteCourant.items.push(...construireLignesArticle(l, compteurRef));
  }

  return {
    sequence: null,
    niveaux: [],
    postesDirects: postesDirects.filter((p) => p.items.length > 0),
  };
}

// Étape 2 : regroupe la séquence en équipements, en utilisant les repères de
// la profondeur choisie comme limite d'équipement. Les repères plus profonds
// (sous-groupes comme "Fourniture et programmation") sont ignorés en tant
// que titres, et leurs lignes rattachées à l'équipement en cours. Le nom
// proposé est le fil d'Ariane des niveaux parents (ex: "B3600 - Sous-station"
// pour un choix au niveau 2). Si le poste lui-même porte une quantité > 1
// dans le devis (ex: "CTA conservés" x3), elle est remontée en `facteur`.
export function grouperParProfondeur(sequence, profondeurChoisie) {
  const postes = [];
  let posteCourant = null;
  const filAriane = [];

  for (const item of sequence) {
    if (item.estCode) {
      if (item.profondeur > profondeurChoisie) continue; // sous-groupe, ignoré
      filAriane[item.profondeur] = item.nom;
      filAriane.length = item.profondeur + 1;
      if (item.profondeur === profondeurChoisie) {
        posteCourant = {
          code: item.code,
          nom: filAriane.join(" - "),
          facteur: item.quantite > 1 ? item.quantite : 1,
          items: [],
        };
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
  const { sequence, niveaux, postesDirects } = analyserClasseur(arrayBuffer);
  if (postesDirects) return postesDirects;
  if (niveaux.length === 0) return [];
  const profondeur = niveaux[niveaux.length - 1].profondeur;
  return grouperParProfondeur(sequence, profondeur);
}
