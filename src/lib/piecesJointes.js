import { arrayRemove, arrayUnion, doc, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";

// Pièces jointes d'une réserve : fichiers dans Firebase Storage
// (reserves/<id>/...), références stockées dans le champ piecesJointes du
// document de la réserve : { nom, url, chemin, type, taille, ajoutePar, ajouteLe }.

export const TAILLE_MAX_PJ = 15 * 1024 * 1024;
export const TYPES_PJ =
  /^(image\/.*|application\/pdf|text\/plain|text\/csv|application\/msword|application\/vnd\.ms-(excel|powerpoint)|application\/vnd\.openxmlformats-officedocument\..*)$/;
export const ACCEPT_PJ = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

export function verifierFichiers(fichiers) {
  for (const f of fichiers) {
    if (f.size > TAILLE_MAX_PJ) return `« ${f.name} » dépasse 15 Mo.`;
    if (!TYPES_PJ.test(f.type || "")) return `« ${f.name} » : type de fichier non accepté (images, PDF, Word, Excel, PowerPoint, texte).`;
  }
  return "";
}

// Envoie les fichiers dans Storage et renvoie les références à enregistrer.
export async function televerserPieces(reserveId, fichiers, auteur) {
  const erreur = verifierFichiers(fichiers);
  if (erreur) throw new Error(erreur);
  const horodatage = Date.now();
  const resultat = [];
  for (let i = 0; i < fichiers.length; i++) {
    const f = fichiers[i];
    const propre = f.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
    const chemin = `reserves/${reserveId}/${horodatage}_${i}_${propre}`;
    const reference = ref(storage, chemin);
    await uploadBytes(reference, f, { contentType: f.type });
    resultat.push({
      nom: f.name,
      url: await getDownloadURL(reference),
      chemin,
      type: f.type,
      taille: f.size,
      ajoutePar: auteur || null,
      ajouteLe: new Date().toISOString(),
    });
  }
  return resultat;
}

// Ajoute des pièces à une réserve existante.
export async function ajouterPieces(reserveId, fichiers, auteur) {
  const pieces = await televerserPieces(reserveId, fichiers, auteur);
  await updateDoc(doc(db, "reserves", reserveId), { piecesJointes: arrayUnion(...pieces) });
  return pieces;
}

export async function retirerPiece(reserveId, piece) {
  await updateDoc(doc(db, "reserves", reserveId), { piecesJointes: arrayRemove(piece) });
  try {
    await deleteObject(ref(storage, piece.chemin));
  } catch {
    /* fichier déjà supprimé ou non autorisé : la référence est retirée quand même */
  }
}
