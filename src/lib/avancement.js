import { useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { joursEntre } from "./dates";

// Avancement d'un chantier en % : moyenne de l'avancement de ses tâches
// (collection "tasks"), pondérée par leur DURÉE (nombre de jours entre
// début et échéance) plutôt que par leur simple nombre — une tâche de
// trois semaines pèse donc bien plus dans le calcul qu'une tâche d'un
// jour. Une tâche "terminée" compte pour 100 % même sans avoir renseigné
// le champ Avancement ; sinon on prend ce champ (0 par défaut, tâche pas
// commencée). Les tâches sans dates comptent pour un jour (poids
// minimal, faute de mieux pour les pondérer). Ne regarde plus les items
// d'équipement régulé — uniquement les tâches (voir demande explicite).
export function calculerAvancementChantier(chantierId, { taches }) {
  const tachesDuChantier = taches.filter((t) => t.chantierId === chantierId);
  if (tachesDuChantier.length === 0) return null;

  let poidsTotal = 0;
  let poidsFait = 0;
  for (const t of tachesDuChantier) {
    const duree =
      t.dateDebut && t.echeance ? Math.max(1, joursEntre(t.dateDebut, t.echeance) + 1) : 1;
    const pct =
      t.statut === "termine" ? 100 : Math.max(0, Math.min(100, Number(t.avancement) || 0));
    poidsTotal += duree;
    poidsFait += duree * (pct / 100);
  }
  return poidsTotal > 0 ? Math.round((poidsFait / poidsTotal) * 100) : 0;
}

// Fait automatiquement passer un chantier de "Actif" (statut par défaut,
// avant que le travail ait commencé) à "En cours" dès que son avancement
// calculé dépasse 0 % — sans jamais toucher un chantier déjà "En pause"
// ou "Terminé" (un statut choisi à la main n'est jamais écrasé). Se
// contente de proposer le hook : à appeler depuis une page qui a déjà
// chargé les chantiers et les tâches (Vue d'ensemble, Chantiers...).
export function useSyncStatutEnCours(chantiers, taches) {
  useEffect(() => {
    for (const c of chantiers) {
      const statutActuel = c.statut || "actif";
      if (statutActuel !== "actif") continue;
      const pct = calculerAvancementChantier(c.id, { taches });
      if (pct !== null && pct > 0) {
        updateDoc(doc(db, "sites", c.id), { statut: "en_cours" }).catch(() => {});
      }
    }
  }, [chantiers, taches]);
}
