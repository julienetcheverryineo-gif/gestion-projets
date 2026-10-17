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

import Dashboard from "../Dashboard";
import Sites from "../Sites";
import SiteDetail from "../SiteDetail";
import Tasks from "../Tasks";
import AccueilAuto from "./AccueilAuto";
import ChantiersAuto from "./ChantiersAuto";
import FicheChantierAuto from "./FicheChantierAuto";
import TachesAuto from "./TachesAuto";

export function AccueilAutomatisme() {
  return useTelephone() ? <AccueilAuto /> : <Dashboard />;
}
export function ListeChantiersAutomatisme() {
  return useTelephone() ? <ChantiersAuto /> : <Sites />;
}
export function FicheChantierAutomatisme() {
  return useTelephone() ? <FicheChantierAuto /> : <SiteDetail />;
}
export function TachesAutomatisme() {
  return useTelephone() ? <TachesAuto /> : <Tasks />;
}

import ReservesGlobal from "../ReservesGlobal";
import Notes from "../Notes";
import ElectriciteNotes from "../ElectriciteNotes";
import { ReservesGlobalMobile, NotesGlobalMobile, ProblemesElecMobile } from "./PagesGlobalesAuto";

export function ReservesGlobalAutomatisme() {
  return useTelephone() ? <ReservesGlobalMobile /> : <ReservesGlobal />;
}
export function NotesAutomatisme() {
  return useTelephone() ? <NotesGlobalMobile /> : <Notes />;
}
export function ProblemesElec() {
  return useTelephone() ? <ProblemesElecMobile /> : <ElectriciteNotes />;
}
