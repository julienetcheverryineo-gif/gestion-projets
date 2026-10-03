import { useEffect } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { joursEntre, formatDateLocale } from "./dates";

// Marge de tolérance (en points de %) avant de signaler un retard : sans
// elle, une tâche tout juste commencée (ex. 1 jour après son début sur 30)
// basculerait en rouge dès le premier jour pour quelques % d'écart — pas
// très utile. Au-delà de cette marge, l'écart entre ce qui est fait et ce
// qui DEVRAIT l'être à la date du jour est jugé significatif.
const TOLERANCE_RETARD = 10;

// Une tâche (ou un chantier) est "en retard" si, à la date du jour, son
// avancement réel est significativement inférieur à l'avancement qu'on
// attendrait d'une progression linéaire entre ses dates de début et de
// fin — ça couvre aussi bien une tâche pas encore commencée alors que sa
// date de début est passée, que des tâches commencées mais qui traînent.
// Pas de retard tant que la date de début n'est pas arrivée ; au-delà de
// l'échéance (et pas encore à 100 %), toujours en retard quel que soit
// l'avancement.
export function estEnRetardParDates(dateDebut, echeance, pourcentage) {
  if (!dateDebut || !echeance) return false;
  if (pourcentage >= 100) return false;
  const aujourdHui = formatDateLocale(new Date());
  if (aujourdHui <= dateDebut) return false;
  if (aujourdHui > echeance) return true;
  const dureeTotale = Math.max(1, joursEntre(dateDebut, echeance));
  const joursEcoules = joursEntre(dateDebut, aujourdHui);
  const attendu = Math.min(100, (joursEcoules / dureeTotale) * 100);
  return pourcentage < attendu - TOLERANCE_RETARD;
}

// Même règle appliquée directement à une tâche (voir Gantt).
export function estEnRetardTache(t) {
  if (t.statut === "termine") return false;
  return estEnRetardParDates(t.dateDebut, t.echeance, pourcentageAvancementTache(t));
}

// Avancement d'un chantier en % : moyenne de l'avancement de ses tâches
// (collection "tasks"), pondérée par leur DURÉE (nombre de jours entre
// début et échéance) plutôt que par leur simple nombre — une tâche de
// trois semaines pèse donc bien plus dans le calcul qu'une tâche d'un
// jour. Une tâche "terminée" compte pour 100 % même sans avoir renseigné
// le champ Avancement ; sinon on prend ce champ (0 par défaut, tâche pas
// commencée). Les tâches sans dates comptent pour un jour (poids
// minimal, faute de mieux pour les pondérer). Ne regarde plus les items
// d'équipement régulé — uniquement les tâches (voir demande explicite).
// % d'avancement d'UNE tâche (0-100) : une tâche "terminée" compte pour
// 100 % même sans avoir renseigné le champ Avancement ; sinon on prend ce
// champ (0 par défaut, tâche pas commencée). Centralisé ici pour que le
// calcul des heures RESTANTES (voir usePlanningData.js, charge du service)
// utilise exactement la même règle que l'avancement d'un chantier.
export function pourcentageAvancementTache(t) {
  if (t.statut === "termine") return 100;
  return Math.max(0, Math.min(100, Number(t.avancement) || 0));
}

export function calculerAvancementChantier(chantierId, { taches }) {
  const tachesDuChantier = taches.filter((t) => t.chantierId === chantierId);
  if (tachesDuChantier.length === 0) return null;

  let poidsTotal = 0;
  let poidsFait = 0;
  for (const t of tachesDuChantier) {
    const duree =
      t.dateDebut && t.echeance ? Math.max(1, joursEntre(t.dateDebut, t.echeance) + 1) : 1;
    const pct = pourcentageAvancementTache(t);
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
