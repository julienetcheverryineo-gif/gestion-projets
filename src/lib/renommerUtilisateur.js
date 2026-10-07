import { collection, doc, getDocs, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

// Renomme un utilisateur (correction d'une faute de saisie, par exemple).
// Les noms sont stockés en toutes lettres partout dans l'appli (équipe d'un
// chantier, responsables de tâches, de réserves…) : on met donc aussi à jour
// ces références pour que la personne reste rattachée à ses chantiers et
// tâches. Renvoie le nombre de documents modifiés en dehors du profil.
export async function renommerUtilisateur(utilisateur, nouveauNom) {
  const ancien = utilisateur.nom;
  const nom = nouveauNom.trim();
  if (!nom || nom === ancien) return 0;

  const operations = [];
  const remplacerListe = (liste) => liste.map((n) => (n === ancien ? nom : n));

  const [sites, taches, regitems, reserves] = await Promise.all(
    ["sites", "tasks", "regitems", "reserves"].map((c) => getDocs(collection(db, c)))
  );

  sites.forEach((d) => {
    const s = d.data();
    const patch = {};
    if (s.ra === ancien) patch.ra = nom;
    if (s.responsableChantier === ancien) patch.responsableChantier = nom;
    if (Array.isArray(s.automaticiens) && s.automaticiens.includes(ancien))
      patch.automaticiens = remplacerListe(s.automaticiens);
    if (Array.isArray(s.electriciens) && s.electriciens.includes(ancien))
      patch.electriciens = remplacerListe(s.electriciens);
    if (Object.keys(patch).length) operations.push((b) => b.update(d.ref, patch));
  });

  const assignations = (snap) =>
    snap.forEach((d) => {
      const v = d.data().assigneA;
      if (Array.isArray(v) && v.includes(ancien)) operations.push((b) => b.update(d.ref, { assigneA: remplacerListe(v) }));
      else if (v === ancien) operations.push((b) => b.update(d.ref, { assigneA: nom }));
    });
  assignations(taches);
  assignations(regitems);

  reserves.forEach((d) => {
    if (d.data().responsable === ancien) operations.push((b) => b.update(d.ref, { responsable: nom }));
  });

  await updateDoc(doc(db, "users", utilisateur.id), { nom });
  for (let i = 0; i < operations.length; i += 400) {
    const batch = writeBatch(db);
    operations.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  return operations.length;
}
