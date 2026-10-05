import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { analyserSapFo, analyserSapMo } from "./parseSapExports";

const TAILLE_LOT = 400;

const CONFIG = {
  fo: { analyser: analyserSapFo, collection: "sapLignesFo" },
  mo: { analyser: analyserSapMo, collection: "sapLignesMo" },
};

// "10.12.2025" -> timestamp (0 si illisible)
function tsDate(texte) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(texte || "");
  return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0;
}

async function supprimerParLots(refs) {
  for (let i = 0; i < refs.length; i += TAILLE_LOT) {
    const batch = writeBatch(db);
    refs.slice(i, i + TAILLE_LOT).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

// Import d'un export SAP lu automatiquement. Contrairement à l'import
// manuel (qui ajoute toujours), un export complet des mêmes affaires
// REMPLACE ce qui avait été importé auparavant pour elles : sinon chaque
// extraction doublerait les achats et les heures.
//  - achats (ME2J) : toutes les lignes existantes des affaires du fichier ;
//  - heures (ZCAT3) : seulement celles dont la date tombe dans la période
//    extraite (l'export ne couvre que cette période).
// Les imports de l'historique qui n'ont plus aucune ligne sont retirés.
export async function importerExportSap({ type, texte, nomFichier, otpDemandes, debut, fin }) {
  const cfg = CONFIG[type];
  const lignes = cfg.analyser(texte);
  if (lignes.length === 0) {
    throw new Error("Aucune ligne de données reconnue dans l'export SAP.");
  }

  const sansPoint = (o) => String(o || "").replace(/\./g, "");
  const otps = new Set();
  [...otpDemandes, ...lignes.map((l) => l.otp)].forEach((o) => {
    if (!o) return;
    otps.add(o);
    otps.add(sansPoint(o));
  });
  const liste = [...otps];

  const tsDebut = debut ? tsDate(debut) : 0;
  const tsFin = fin ? tsDate(fin) : 0;
  const anciennes = [];
  for (let i = 0; i < liste.length; i += 10) {
    const snap = await getDocs(
      query(collection(db, cfg.collection), where("otp", "in", liste.slice(i, i + 10)))
    );
    snap.docs.forEach((d) => {
      if (type === "mo" && tsDebut && tsFin) {
        const ts = tsDate(d.data().date);
        if (ts && (ts < tsDebut || ts > tsFin)) return;
      }
      anciennes.push(d);
    });
  }
  const importsTouches = new Set(anciennes.map((d) => d.data().importId).filter(Boolean));
  await supprimerParLots(anciennes.map((d) => d.ref));
  for (const importId of importsTouches) {
    const reste = await getDocs(
      query(collection(db, cfg.collection), where("importId", "==", importId), limit(1))
    );
    if (reste.empty) await deleteDoc(doc(db, "sapImports", importId));
  }

  const importRef = await addDoc(collection(db, "sapImports"), {
    type,
    nomFichier,
    nbLignes: lignes.length,
    creeLe: serverTimestamp(),
  });
  for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
    const batch = writeBatch(db);
    for (const ligne of lignes.slice(i, i + TAILLE_LOT)) {
      batch.set(doc(collection(db, cfg.collection)), {
        ...ligne,
        importId: importRef.id,
        creeLe: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return { nbLignes: lignes.length, nbRemplacees: anciennes.length };
}
