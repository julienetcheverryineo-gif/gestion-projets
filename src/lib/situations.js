import { estLigneSomme } from "./ligneSomme";

// Situations de travaux (facturation) d'un chantier Électricité.
// Stockage : chantier.situations = [{ numero, date, auteur, avancements:
// { <ligneId>: cumul % (0-100) } }]. Les prix sont ceux de la minute
// (« PV ligne ») ; chaque situation porte l'avancement CUMULÉ par ligne, le
// montant de la période est la différence avec la situation précédente.

export const TVA_DEFAUT = 20;

const arrondi2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const RE_CHAPITRE = /^\d+\s*[-–.]\s*\S/;

// Lignes de la minute, dans l'ordre de lecture, prêtes pour la situation :
//  - "chapitre" : titre de chapitre ("1 - Travaux ...") ou nom du devis ;
//  - "titre"    : sous-titre en gras ("Etudes d'exécution :") ;
//  - "ligne"    : ligne facturable (quantité × prix de vente unitaire).
// Les lignes « somme » (têtes de regroupement) ne sont jamais facturables.
export function construireLignesSituation(devisList, toutesLignes, chantierId) {
  const lignes = toutesLignes.filter((l) => l.chantierId === chantierId);
  const rows = [];
  devisList.forEach((d) => {
    const duDevis = lignes
      .filter((l) => l.devisId === d.id)
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    if (duDevis.length === 0) return;
    if (devisList.length > 1) rows.push({ type: "chapitre", id: "devis-" + d.id, texte: d.nom || "Devis" });
    duDevis.forEach((l) => {
      const texte = String(l.designation || "").trim();
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
      rows.push({
        type: "ligne",
        id: l.id,
        code: l.code || "",
        texte: l.detail ? texte + "\n" + l.detail : texte,
        unite: l.unite || "",
        quantite,
        pu: pv / quantite,
        total: arrondi2(pv),
      });
    });
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
