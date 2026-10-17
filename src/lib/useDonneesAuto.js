import { useMemo } from "react";
import { useCollection } from "./firestoreHooks";
import { estChantierAutomatisme } from "../components/SiteFormModal";
import { calculerAvancementChantier, estEnRetardTache } from "./avancement";
import { normaliserAssignes } from "./assignes";

const aujourdhui = () => new Date(new Date().toDateString());

// Une réserve est « en retard » si son échéance est dépassée, ou si elle n'a
// encore ni échéance (même règle que la vue d'ensemble).
export function reserveEnRetard(r) {
  if (r.statut === "levee") return false;
  if (!r.dateEcheance) return true;
  return new Date(r.dateEcheance) < aujourdhui();
}
export function tacheEchue(t) {
  if (!t.echeance || t.statut === "termine") return false;
  return new Date(t.echeance) < aujourdhui();
}
export function tacheEnRetard(t) {
  return tacheEchue(t) || estEnRetardTache(t);
}
export function statsTests(points) {
  const s = { total: points.length, ok: 0, ko: 0, annule: 0, restants: 0 };
  points.forEach((p) => {
    if (p.statut === "ok") s.ok++;
    else if (p.statut === "ko") s.ko++;
    else if (p.statut === "annule") s.annule++;
    else s.restants++;
  });
  s.faits = s.ok + s.ko + s.annule;
  s.pct = s.total > 0 ? Math.round((s.faits / s.total) * 100) : null;
  return s;
}
export function formatDateCourte(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

// Toutes les collections de l'espace Automatisme & GTB utiles à la vue
// téléphone (lues depuis le cache local quand il n'y a pas de réseau).
export function useDonneesAuto(profile) {
  const { documents: sites, chargement } = useCollection("sites");
  const { documents: taches } = useCollection("tasks");
  const { documents: reserves } = useCollection("reserves");
  const { documents: testEquipements } = useCollection("testEquipements");
  const { documents: testPoints } = useCollection("testPoints");
  const nom = profile?.nom || "";

  return useMemo(() => {
    const chantiers = sites.filter(estChantierAutomatisme);
    const resume = {};
    chantiers.forEach((c) => {
      const ts = taches.filter((t) => t.chantierId === c.id);
      const rs = reserves.filter((r) => r.chantierId === c.id);
      const pts = testPoints.filter((p) => p.chantierId === c.id);
      resume[c.id] = {
        avancement: calculerAvancementChantier(c.id, { taches }),
        nbTaches: ts.length,
        tachesRetard: ts.filter(tacheEnRetard).length,
        reservesOuvertes: rs.filter((r) => r.statut !== "levee").length,
        reservesRetard: rs.filter(reserveEnRetard).length,
        tests: statsTests(pts),
        mien:
          nom !== "" &&
          (c.responsableChantier === nom || c.ra === nom || (c.automaticiens || []).includes(nom) || (c.electriciens || []).includes(nom)),
      };
    });
    const mesTaches = taches.filter((t) => normaliserAssignes(t.assigneA).includes(nom));
    return { chantiers, chargement, taches, reserves, testEquipements, testPoints, resume, mesTaches };
  }, [sites, taches, reserves, testEquipements, testPoints, chargement, nom]);
}
