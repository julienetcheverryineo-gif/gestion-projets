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
    if (duDevis.length === 0) return;
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
        const somme = membres.reduce((t, m) => t + (m.id === l.id ? 0 : Number(m.pvLigne) || 0), 0);
        const pvTete = Number(l.pvLigne) || 0;
        const pv = pvTete !== 0 ? pvTete : somme;
        if (pv === 0) {
          if (texte) rows.push({ type: "titre", id: l.id, texte });
          return;
        }
        const quantite = Number(l.quantite) > 0 ? Number(l.quantite) : 1;
        const rowTete = {
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
