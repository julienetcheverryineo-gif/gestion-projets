// Points d'attention d'un chantier, déduits des indicateurs (liste et synthèse
// mobiles). niveau : danger (rouge), warn (orange), info (bleu).
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function alertesChantier(ind) {
  if (!ind) return [];
  const a = [];
  const e = ind.etat || {};
  if (e.paiement === "retard") {
    a.push({ id: "paiement", niveau: "danger", titre: "Paiement en retard", detail: e.nbRetard + " facture(s) échue(s) non réglée(s)" });
  }
  if (ind.factVsReel?.etat === "retard") a.push({ id: "fvr", niveau: "warn", titre: "Sous-facturé vs dépenses", detail: ind.factVsReel.texte });
  if (ind.factVsAvancement?.etat === "retard") a.push({ id: "fva", niveau: "warn", titre: "Sous-facturé vs avancement", detail: ind.factVsAvancement.texte });
  if (e.coherence && !e.coherence.ok) {
    a.push({
      id: "coh",
      niveau: "warn",
      titre: "Écart SAP / situations",
      detail:
        e.coherence.ecart > 0
          ? "SAP a facturé " + nf.format(e.coherence.ecart) + " € de plus que les situations"
          : "Situations en avance de " + nf.format(-e.coherence.ecart) + " € sur SAP",
    });
  }
  if (ind.heuresNonAffectees > 0) a.push({ id: "h", niveau: "warn", titre: "Heures SAP non affectées", detail: nf1.format(ind.heuresNonAffectees) + " h à rattacher à une tâche" });
  if (ind.fournituresNonAffectees > 0.005) {
    a.push({ id: "f", niveau: "warn", titre: "Fournitures non affectées", detail: nf.format(ind.fournituresNonAffectees) + " € d'achats SAP sans devis" });
  }
  if (ind.factVsReel?.etat === "avance") a.push({ id: "fvr+", niveau: "info", titre: "Sur-facturé vs dépenses", detail: ind.factVsReel.texte });
  if (ind.factVsAvancement?.etat === "avance") a.push({ id: "fva+", niveau: "info", titre: "Sur-facturé vs avancement", detail: ind.factVsAvancement.texte });
  if (e.paiement === "attente") a.push({ id: "att", niveau: "info", titre: "Paiement en attente", detail: e.nbAttente + " facture(s) à régler" });
  return a;
}

export const scoreAlertes = (alertes) => alertes.reduce((s, x) => s + (x.niveau === "danger" ? 3 : x.niveau === "warn" ? 2 : 0), 0);
export const nbAttention = (alertes) => alertes.filter((x) => x.niveau !== "info").length;
