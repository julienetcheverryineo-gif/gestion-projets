import { suivreEcriture } from "./offline";
import { afficherToast } from "../components/mobile/Ui";

// Écriture Firestore « fire and forget » pour la vue téléphone : l'écran est
// déjà à jour grâce au cache local, l'écriture part dès que le réseau est là.
export function ecrire(promesse) {
  suivreEcriture(promesse).catch(() => afficherToast("Modification refusée (droits insuffisants)"));
}
