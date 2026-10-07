import { addDoc, collection, doc, getDocs, limit, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { analyserClasseur, grouperParProfondeur } from "./parseDevis";
import { analyserMinuteElectricite } from "./parseMinuteElectricite";
import { champsDocumentLigne, groupesDuFichier } from "./majMinuteElectricite";

// Une même minute de devis alimente les deux espaces d'un chantier :
// l'Automatisme (équipements, matériel, tâches) et l'Électricité (devis,
// lignes, groupes). Importer l'un prépare l'autre, sans refaire l'import.

// Écriture par lots de 400 (marge sous la limite de 500 opérations Firestore).
export async function ecrireParLots(operations) {
  const TAILLE_LOT = 400;
  for (let i = 0; i < operations.length; i += TAILLE_LOT) {
    const batch = writeBatch(db);
    operations.slice(i, i + TAILLE_LOT).forEach((op) => op(batch));
    await batch.commit();
  }
}

// Côté Électricité : nouveau devis (onglet) + lignes + groupes.
export async function ecrireDevisElec({ chantierId, nomDevis, nomFichier, sequence, ordre }) {
  const devisRef = await addDoc(collection(db, "elecDevis"), {
    chantierId,
    nom: nomDevis.trim(),
    nomFichier,
    ordre,
    creeLe: serverTimestamp(),
  });
  const refs = sequence.map(() => doc(collection(db, "elecLignes")));
  const groupes = groupesDuFichier(sequence).map((g) => ({
    ...g,
    ref: doc(collection(db, "elecGroupes")),
  }));
  const groupeDe = new Map();
  groupes.forEach((g) => g.membres.forEach((i) => groupeDe.set(i, g.ref.id)));
  await ecrireParLots([
    ...groupes.map((g) => (batch) => {
      batch.set(g.ref, {
        chantierId,
        devisId: devisRef.id,
        nom: g.nom,
        ligneRepresentativeId: refs[g.tete].id,
        creeLe: serverTimestamp(),
      });
    }),
    ...sequence.map((ligne, i) => (batch) => {
      batch.set(refs[i], {
        ...champsDocumentLigne(ligne),
        ...(groupeDe.has(i) ? { groupeId: groupeDe.get(i) } : {}),
        devisId: devisRef.id,
        chantierId,
        creeLe: serverTimestamp(),
      });
    }),
  ]);
  return devisRef.id;
}

// Côté Automatisme : équipements régulés, matériel à acheter et tâches.
export async function ecrireAutomatisme({ chantierId, postes }) {
  const baseOrdre = Date.now();
  let nbEquipements = 0;
  let nbTaches = 0;
  for (let index = 0; index < postes.length; index++) {
    const poste = postes[index];
    const aDuMateriel = poste.items.some((it) => it.type === "materiel" && it.designation.trim());
    let regRef = null;
    if (aDuMateriel) {
      regRef = await addDoc(collection(db, "regequipements"), {
        nom: poste.nomEdite ?? poste.nom,
        chantierId,
        code: poste.code,
        ordre: baseOrdre + index,
        creeLe: serverTimestamp(),
      });
      nbEquipements += 1;
    }
    let ordreTache = 0;
    for (const item of poste.items) {
      if (!item.designation.trim()) continue;
      if (item.type === "tache") {
        ordreTache += 1;
        await addDoc(collection(db, "tasks"), {
          titre: item.designation,
          chantierId,
          equipementSource: poste.nomEdite ?? poste.nom,
          assigneA: [],
          heuresPrevues: item.heuresPrevues || null,
          dateDebut: null,
          echeance: null,
          lienDevis: null,
          commentaires: null,
          statut: "a_faire",
          ordre: baseOrdre + index * 1000 + ordreTache,
          creeLe: serverTimestamp(),
        });
        nbTaches += 1;
        continue;
      }
      if (!regRef) continue;
      await addDoc(collection(db, "regitems"), {
        regEquipementId: regRef.id,
        type: "materiel",
        designation: item.designation,
        remarque: item.detail || "",
        unite: item.unite || "",
        quantite: item.quantite || 0,
        statut: "a_acheter",
        creeLe: serverTimestamp(),
      });
    }
  }
  return { nbEquipements, nbTaches };
}

async function existeDeja(collectionNom, contraintes) {
  const snap = await getDocs(query(collection(db, collectionNom), ...contraintes, limit(1)));
  return !snap.empty;
}

// Import Électricité -> prépare l'Automatisme avec la même minute. Sans
// intervention : niveau de regroupement le plus profond du fichier (comme
// parseDevisWorkbook). Ne fait rien si le chantier a déjà des équipements
// ou des tâches. Toujours sans erreur remontée : retourne un message.
export async function preparerAutomatismeDepuisMinute(buffer, chantierId) {
  try {
    if (
      (await existeDeja("regequipements", [where("chantierId", "==", chantierId)])) ||
      (await existeDeja("tasks", [where("chantierId", "==", chantierId)]))
    ) {
      return "Automatisme : équipements/tâches déjà présents sur ce chantier, rien n'a été ajouté.";
    }
    const resultat = analyserClasseur(buffer);
    let postes = resultat.postesDirects;
    if (!postes) {
      if (resultat.niveaux.length === 0) return "Automatisme : aucun équipement détecté dans ce fichier.";
      const profondeur = resultat.niveaux[resultat.niveaux.length - 1].profondeur;
      postes = grouperParProfondeur(resultat.sequence, profondeur);
    }
    if (postes.length === 0) return "Automatisme : aucun équipement détecté dans ce fichier.";
    const { nbEquipements, nbTaches } = await ecrireAutomatisme({ chantierId, postes });
    return `Automatisme : ${nbEquipements} équipement(s) et ${nbTaches} tâche(s) préparés.`;
  } catch (err) {
    return "Automatisme non préparé : " + (err.code === "permission-denied" ? "droits insuffisants pour votre profil." : err.message);
  }
}

// Import Automatisme -> prépare l'Électricité avec la même minute (nouveau
// devis), même si le chantier n'est pas (encore) rattaché à l'Électricité.
// Ne fait rien si un devis du même fichier existe déjà sur ce chantier.
export async function preparerElecDepuisMinute(buffer, chantierId, nomFichier) {
  try {
    if (await existeDeja("elecDevis", [where("chantierId", "==", chantierId), where("nomFichier", "==", nomFichier)])) {
      return "Électricité : ce fichier est déjà importé sur ce chantier, rien n'a été ajouté.";
    }
    const sequence = analyserMinuteElectricite(buffer);
    const nbLignes = sequence.filter((l) => !l.estPoste).length;
    if (nbLignes === 0) return "Électricité : aucune ligne détectée dans ce fichier.";
    const existants = await getDocs(query(collection(db, "elecDevis"), where("chantierId", "==", chantierId)));
    await ecrireDevisElec({
      chantierId,
      nomDevis: nomFichier.replace(/\.[^.]+$/, ""),
      nomFichier,
      sequence,
      ordre: existants.size,
    });
    return `Électricité : devis préparé (${nbLignes} ligne(s)).`;
  } catch (err) {
    return "Électricité non préparée : " + (err.code === "permission-denied" ? "droits insuffisants pour votre profil." : err.message);
  }
}
