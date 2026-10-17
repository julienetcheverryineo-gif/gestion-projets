import { useTelephone } from "../../lib/telephone";
import ElectriciteChantiers from "../ElectriciteChantiers";
import ElectriciteSiteDetail from "../ElectriciteSiteDetail";
import ListeChantiersMobile from "./ListeChantiersMobile";
import FicheChantierMobile from "./FicheChantierMobile";

// Même route, deux interfaces : téléphone (≤ 640 px) ou version complète.
export function ListeChantiersElec() {
  return useTelephone() ? <ListeChantiersMobile /> : <ElectriciteChantiers />;
}
export function FicheChantierElec() {
  return useTelephone() ? <FicheChantierMobile /> : <ElectriciteSiteDetail />;
}
