import { estLigneSomme } from "./ligneSomme";

// Situations de travaux (facturation) d'un chantier Électricité.
// Stockage : chantier.situations = [{ numero, date, auteur, avancements:
// { <ligneId>: cumul % (0-100) } }]. Les prix sont ceux de la minute
// (« PV ligne ») ; chaque situation porte l'avancement CUMULÉ par ligne, le
// montant de la période est la différence avec la situation précédente.

export const TVA_DEFAUT = 20;

const arrondi2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Avancement réel suivi (Suivi d'avancement) d'un ensemble de lignes :
// coûts FO et heures pondérés par leur % FO / % MO.
function agregerSuivi(lignes) {
  const a = { fo: 0, foFait: 0, h: 0, hFait: 0, brut: 0, brutN: 0 };
  lignes.forEach((m) => {
    if (m.estPoste || estLigneSomme(m)) return;
    const pFo = Number(m.avancementFo ?? m.avancement ?? 0) / 100;
    const pMo = Number(m.avancementMo ?? m.avancement ?? 0) / 100;
    const fo = Number(m.coutTotalFo) || 0;
    const h = Number(m.tempsTotalHeures) || 0;
    a.fo += fo;
    a.foFait += fo * pFo;
    a.h += h;
    a.hFait += h * pMo;
    a.brut += Math.max(pFo, pMo);
    a.brutN += 1;
  });
  return a;
}

// % d'avancement logique (0-100) d'une ligne de situation à partir de son
// suivi : FO en euros et MO en heures valorisées au taux donné (€/h).
export function pctLogique(suivi, tauxMo = 0) {
  if (!suivi) return 0;
  const poidsMo = suivi.h * (tauxMo || 0);
  const total = suivi.fo + poidsMo;
  if (total > 0) return ((suivi.foFait + suivi.hFait * (tauxMo || 0)) / total) * 100;
  return suivi.brutN > 0 ? (suivi.brut / suivi.brutN) * 100 : 0;
}

const RE_CHAPITRE = /^\d+\s*[-–.]\s*\S/;

// Lignes de la minute, dans l'ordre de lecture, prêtes pour la situation :
//  - "chapitre" : titre de chapitre ("1 - Travaux ...") ou nom du devis ;
//  - "titre"    : sous-titre en gras ("Etudes d'exécution :") ;
//  - "ligne"    : ligne facturable (quantité × prix de vente unitaire).
// Les lignes « somme » (têtes de regroupement) ne sont jamais facturables.
export function construireLignesSituation(devisList, toutesLignes, chantierId, groupes = []) {
  const lignes = toutesLignes.filter((l) => l.chantierId === chantierId);
  // Regroupements (gris foncé qui somme des gris clair) : seule la ligne de
  // tête est facturée, ses lignes membres n'apparaissent pas.
  const groupeParId = new Map(groupes.map((g) => [g.id, g]));
  // Lignes de compensation (fond hachuré) : leur montant est ajouté à la
  // ligne du dessus (ou à la tête du groupe gris foncé dont elle fait partie).
  let cible = null;
  const teteParGroupe = new Map();
  const rows = [];
  devisList.forEach((d) => {
    const duDevis = lignes
      .filter((l) => l.devisId === d.id)
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    const vendu = Number(d.montantVendu) || 0;
    if (duDevis.length === 0 && !vendu) return;
    if (devisList.length > 1) rows.push({ type: "chapitre", id: "devis-" + d.id, texte: d.nom || "Devis" });
    cible = null;
    teteParGroupe.clear();
    duDevis.forEach((l) => {
      const texte = String(l.designation || "").trim();
      if (!l.estPoste && l.compensation && cible) {
        const pv = Number(l.pvLigne) || 0;
        cible.total = arrondi2(cible.total + pv);
        cible.pu = cible.total / cible.quantite;
        cible.compensation = arrondi2((cible.compensation || 0) + pv);
        return;
      }
      const groupe = !l.estPoste && l.groupeId ? groupeParId.get(l.groupeId) : null;
      if (groupe) {
        if (groupe.ligneRepresentativeId !== l.id) {
          cible = teteParGroupe.get(l.groupeId) || cible; // ligne gris clair : masquée
          return;
        }
        const membres = duDevis.filter((m) => m.groupeId === l.groupeId);
        const somme = membres.reduce((t, m) => t + (m.id === l.id || m.compensation ? 0 : Number(m.pvLigne) || 0), 0);
        const pvTete = Number(l.pvLigne) || 0;
        // Tête gris foncé : son propre montant + celui de ses lignes gris clair,
        // toujours additionnés (même si les deux montants sont égaux).
        const pv = arrondi2(pvTete + somme);
        if (pv === 0) {
          if (texte) rows.push({ type: "titre", id: l.id, texte });
          return;
        }
        const quantite = Number(l.quantite) > 0 ? Number(l.quantite) : 1;
        const rowTete = {
          suivi: agregerSuivi(membres.length > 1 ? membres.filter((m) => m.id !== l.id || !estLigneSomme(l)) : membres),
          type: "ligne",
          id: l.id,
          code: l.code || "",
          texte: l.detail ? texte + "\n" + l.detail : texte,
          unite: l.unite || "Ens",
          quantite,
          pu: pv / quantite,
          total: arrondi2(pv),
        };
        rows.push(rowTete);
        teteParGroupe.set(l.groupeId, rowTete);
        cible = rowTete;
        return;
      }
      if (l.estPoste) {
        if (texte) rows.push({ type: "titre", id: l.id, texte });
        return;
      }
      if (estLigneSomme(l)) {
        if (RE_CHAPITRE.test(texte)) rows.push({ type: "chapitre", id: l.id, texte });
        else if (texte) rows.push({ type: "titre", id: l.id, texte });
        return;
      }
      if (l.informative) {
        if (RE_CHAPITRE.test(texte)) rows.push({ type: "chapitre", id: l.id, texte });
        else if (/:\s*$/.test(texte)) rows.push({ type: "titre", id: l.id, texte });
        return;
      }
      const pv = Number(l.pvLigne) || 0;
      if (pv === 0) return;
      const quantite = Number(l.quantite) > 0 ? Number(l.quantite) : 1;
      const rowLigne = {
        suivi: agregerSuivi([l]),
        type: "ligne",
        id: l.id,
        code: l.code || "",
        texte: l.detail ? texte + "\n" + l.detail : texte,
        unite: l.unite || "",
        quantite,
        pu: pv / quantite,
        total: arrondi2(pv),
      };
      rows.push(rowLigne);
      cible = rowLigne;
    });
    // Commande saisie sans minute : montant vendu porté par le devis, facturable comme une ligne.
    if (vendu > 0) {
      rows.push({
        suivi: agregerSuivi(duDevis.filter((l) => !l.estPoste)),
        type: "ligne",
        id: "vendu-" + d.id,
        code: "",
        texte: d.nom || "Commande",
        unite: "Ens",
        quantite: 1,
        pu: vendu,
        total: arrondi2(vendu),
      });
    }
  });
  return rows;
}

// Montant d'avancement d'une ligne à un cumul donné (en %).
export const montantAvancement = (ligne, pct) => arrondi2(((Number(pct) || 0) / 100) * ligne.total);

// Cumul (%) de chaque ligne dans la situation d'index i (0 si absent).
export const pctCumule = (situations, i, ligneId) => Number(situations?.[i]?.avancements?.[ligneId]) || 0;

// Montants HT cumulés pour la situation d'index i.
export function totalCumule(rows, situations, i) {
  if (i < 0) return 0;
  return arrondi2(
    rows
      .filter((r) => r.type === "ligne")
      .reduce((s, r) => s + montantAvancement(r, pctCumule(situations, i, r.id)), 0)
  );
}

export const montantMarche = (rows) =>
  arrondi2(rows.filter((r) => r.type === "ligne").reduce((s, r) => s + r.total, 0));

// Montant à déduire pour la situation d'index i : l'acompte pour la première,
// puis le cumul de la situation précédente (qui a déjà absorbé l'acompte).
export function montantADeduire(rows, situations, i, acompte = 0) {
  const precedent = i > 0 ? totalCumule(rows, situations, i - 1) : 0;
  return arrondi2(Math.max(precedent, Number(acompte) || 0));
}

// Répartit un montant de travaux (HT) sur les lignes pour une nouvelle
// situation : on avance d'abord les lignes vers leur avancement « logique »
// (suivi réel), proportionnellement à leur retard ; si le montant dépasse ce
// retard, le surplus est réparti au prorata du reste à facturer de chaque
// ligne. Renvoie { avancements } (cumul % par ligne) ou { erreur }.
export function repartirMontant(rows, avancementsPrecedents, montant, logiqueDe) {
  const lignes = rows.filter((r) => r.type === "ligne" && r.total > 0);
  const cible = arrondi2(montant);
  if (!(cible > 0)) return { erreur: "Montant invalide." };
  const av = { ...avancementsPrecedents };
  const cumul = (id) => Number(av[id]) || 0;
  const reste = lignes.reduce((t, r) => t + r.total * (1 - Math.min(100, cumul(r.id)) / 100), 0);
  if (cible > arrondi2(reste) + 0.005)
    return { erreur: "Montant supérieur au reste à facturer (" + arrondi2(reste) + " € HT)." };

  const retards = lignes.map((r) => {
    const p = Math.min(100, cumul(r.id));
    const l = Math.max(p, Math.min(100, logiqueDe(r)));
    return { r, p, l, retard: ((l - p) / 100) * r.total };
  });
  const totalRetard = retards.reduce((t, x) => t + x.retard, 0);
  const phase1 = Math.min(cible, totalRetard);
  if (totalRetard > 0) {
    const f = phase1 / totalRetard;
    retards.forEach((x) => {
      av[x.r.id] = x.p + (x.l - x.p) * f;
    });
  }
  let surplus = cible - phase1;
  if (surplus > 0.005) {
    const resteApres = lignes.reduce((t, r) => t + r.total * (1 - cumul(r.id) / 100), 0);
    const f = surplus / resteApres;
    lignes.forEach((r) => {
      const p = cumul(r.id);
      av[r.id] = p + (100 - p) * f;
    });
  }
  lignes.forEach((r) => {
    av[r.id] = Math.round(av[r.id] * 10000) / 10000;
  });
  // Ajustement des centimes sur la ligne qui a le plus de marge.
  const total = (a) => lignes.reduce((t, r) => t + montantAvancement(r, a[r.id] ?? 0), 0);
  const avant = lignes.reduce((t, r) => t + montantAvancement(r, avancementsPrecedents[r.id] ?? 0), 0);
  const ecart = arrondi2(cible - (total(av) - avant));
  if (Math.abs(ecart) >= 0.005) {
    const l = [...lignes].sort((a, b) => b.total * (1 - av[b.id] / 100) - a.total * (1 - av[a.id] / 100))[0];
    if (l) av[l.id] = Math.min(100, Math.max(0, Math.round((av[l.id] + (ecart / l.total) * 100) * 10000) / 10000));
  }
  return { avancements: av };
}
