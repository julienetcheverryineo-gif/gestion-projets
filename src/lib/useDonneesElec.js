import { useMemo } from "react";
import { useCollection } from "./firestoreHooks";
import { useTauxHoraires } from "./tauxHoraires";
import { calculerIndicateursChantier } from "../pages/ElectriciteSiteDetail";

// Toutes les collections nécessaires aux écrans mobiles Électricité (les mêmes
// que la fiche complète) + calcul des indicateurs d'un chantier. Tout vient du
// cache local quand il n'y a pas de réseau.
export function useDonneesElec() {
  const { documents: chantiers, chargement } = useCollection("sites");
  const { documents: tousDevis } = useCollection("elecDevis");
  const { documents: toutesLignes } = useCollection("elecLignes");
  const { documents: tousGroupes } = useCollection("elecGroupes");
  const { documents: sapLignesFo } = useCollection("sapLignesFo");
  const { documents: sapLignesMo } = useCollection("sapLignesMo");
  const { taux: tauxHoraire } = useTauxHoraires();
  return { chantiers, chargement, tousDevis, toutesLignes, tousGroupes, sapLignesFo, sapLignesMo, tauxHoraire };
}

export function useIndicateurs(chantier, donnees) {
  const { tousDevis, toutesLignes, tousGroupes, sapLignesFo, sapLignesMo, tauxHoraire } = donnees;
  return useMemo(() => {
    if (!chantier) return null;
    try {
      return calculerIndicateursChantier(chantier, { tousDevis, toutesLignes, tousGroupes, sapLignesFo, sapLignesMo, tauxHoraire });
    } catch (err) {
      console.error("Indicateurs " + chantier.nom, err);
      return null;
    }
  }, [chantier, tousDevis, toutesLignes, tousGroupes, sapLignesFo, sapLignesMo, tauxHoraire]);
}
