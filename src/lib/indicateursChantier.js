import { construireLignesSituation, montantAvancement, montantMarche, pctLogique, totalCumule } from "./situations";

// Indicateurs de synthèse d'un chantier Électricité, affichés dans la liste des
// chantiers. Calculés dans la fiche chantier (qui dispose de toutes les données
// SAP et du suivi) puis enregistrés dans le document chantier (champ
// `indicateurs`) : la liste les relit sans tout recalculer.

const CLE_ENSEMBLE = "_all";

const euro = (n) =>
  Number(n || 0)
    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[  ]/g, " ");

const dateObj = (d) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(d || "").trim());
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
};

// Statut d'une facture SAP : payee, attente (à régler), retard (échéance dépassée), annulee.
export function statutFactureSap(f) {
  if (f.annulee) return "annulee";
  if (f.payee) return "payee";
  const ech = dateObj(f.echeance);
  const finJour = new Date();
  finJour.setHours(0, 0, 0, 0);
  if (f.retardJours > 0 || (ech && ech < finJour)) return "retard";
  return "attente";
}

// Facturation face au réel (même règle que le bloc « Facturation vs réel » de
// l'onglet Situations) et état de facturation (cohérence avec SAP, paiements,
// retard par rapport à l'avancement suivi).
export function calculerFacturation({ chantier, devis, toutesLignes, groupes, sap, tauxMo }) {
  const data = chantier?.situationsData || {};
  const mode = chantier?.situationsMode === "devis" ? "devis" : "ensemble";
  const groupesSit = mode === "devis" ? devis.map((d) => [d.id, [d]]) : [[CLE_ENSEMBLE, devis]];
  let facture = 0;
  let cumulSituations = 0;
  let logique = 0;
  let aSituations = false;
  groupesSit.forEach(([k, ds]) => {
    const sits = data[k];
    const ac = Number(chantier?.acompteData?.[k]) || 0;
    if (!sits?.length) {
      facture += ac;
      return;
    }
    aSituations = true;
    const rows = construireLignesSituation(ds, toutesLignes, chantier.id, groupes || []);
    const cumul = totalCumule(rows, sits, sits.length - 1);
    facture += Math.max(ac, cumul);
    cumulSituations += cumul;
    logique += rows
      .filter((r) => r.type === "ligne")
      .reduce((t, r) => t + montantAvancement(r, Math.round(Math.min(100, pctLogique(r.suivi, tauxMo || 0)) * 10) / 10), 0);
  });
  const marcheTotal = montantMarche(construireLignesSituation(devis, toutesLignes, chantier.id, groupes || []));

  // Facturation vs réel
  let factVsReel = null;
  if (sap && marcheTotal > 0) {
    const pF = (facture / marcheTotal) * 100;
    const pAv = sap.avancementPct;
    const pSap = sap.disponible ? (sap.reel / sap.budget) * 100 : null;
    const attendu = Math.max(pAv, pSap ?? 0);
    const ecartPts = attendu - pF;
    const ecartEuro = (ecartPts / 100) * marcheTotal;
    if (ecartPts > 2) {
      factVsReel = {
        etat: "retard",
        texte:
          "Sous-facturé d'environ " + euro(ecartEuro) + " € HT " + (pSap !== null && pSap > pAv ? "(dépenses SAP en avance)" : "(avancement réel en avance)"),
      };
    } else if (ecartPts < -2) {
      factVsReel = { etat: "avance", texte: "Sur-facturé d'environ " + euro(-ecartEuro) + " € HT (par rapport au réel)" };
    } else {
      factVsReel = { etat: "ok", texte: "Facturation cohérente (avancement et dépenses SAP)" };
    }
  }

  // État de facturation
  const commandes = chantier?.sapFacturation?.commandes || [];
  const factures = chantier?.sapFacturation?.factures || [];
  let coherence = null;
  if (commandes.length > 0) {
    const sapFacture = commandes.reduce((t, c) => t + (c.montantHt - c.resteHt), 0);
    const ecart = Math.round((sapFacture - facture) * 100) / 100;
    coherence = Math.abs(ecart) < 1 ? { ok: true } : { ok: false, ecart };
  }
  const statuts = factures.map(statutFactureSap);
  const nbRetard = statuts.filter((s) => s === "retard").length;
  const nbAttente = statuts.filter((s) => s === "attente").length;
  const paiement = factures.length === 0 ? null : nbRetard > 0 ? "retard" : nbAttente > 0 ? "attente" : "ok";
  const retardHt = Math.round((logique - cumulSituations) * 100) / 100;
  const aJour = aSituations ? retardHt <= 0.5 : null;
  // Facturation face à l'avancement suivi (situations cumulées vs avancement logique).
  let factVsAvancement = null;
  if (aSituations) {
    if (retardHt > 0.5) {
      factVsAvancement = { etat: "retard", texte: "Sous-facturé d'environ " + euro(retardHt) + " € HT par rapport à l'avancement suivi" };
    } else if (retardHt < -0.5) {
      factVsAvancement = { etat: "avance", texte: "Sur-facturé d'environ " + euro(-retardHt) + " € HT par rapport à l'avancement suivi" };
    } else {
      factVsAvancement = { etat: "ok", texte: "Facturation cohérente avec l'avancement suivi" };
    }
  }
  return {
    marche: Math.round(marcheTotal * 100) / 100,
    facture: Math.round(facture * 100) / 100,
    factVsReel,
    factVsAvancement,
    etat: {
      coherence,
      paiement,
      nbRetard,
      nbAttente,
      aJour,
      retardHt: aSituations && retardHt > 0.5 ? retardHt : 0,
    },
  };
}
