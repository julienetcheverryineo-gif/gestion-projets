import { estLigneSomme } from "./ligneSomme";

// Tour de chantier (vue téléphone) : transforme les lignes d'un devis en une
// liste lisible au doigt — postes (chapitres), sous-titres, commentaires et
// lignes à avancer — avec les regroupements gérés comme dans la fiche
// complète (une ligne de tête pour tout le groupe).

const RE_CHAPITRE = /^\d+\s*[-–.]\s*\S/;
const borne = (v) => Math.max(0, Math.min(100, Number(v) || 0));
const pctFoDe = (l) => borne(l.avancementFo ?? l.avancement ?? 0);
const pctMoDe = (l) => borne(l.avancementMo ?? l.avancement ?? 0);

function moyenne(membres, champValeur, lirePct) {
  const budget = membres.reduce((s, l) => s + (Number(l[champValeur]) || 0), 0);
  if (budget > 0) return membres.reduce((s, l) => s + ((Number(l[champValeur]) || 0) * lirePct(l)) / 100, 0) / budget * 100;
  return membres.length ? membres.reduce((s, l) => s + lirePct(l), 0) / membres.length : 0;
}

function itemLigne(base, membres, groupe) {
  // La note de visite est portée par la ligne de tête (ou la 1re ligne d'un groupe sans tête).
  const porteNote = String(base.id).startsWith("g_") ? membres[0] : base;
  const cout = membres.reduce((s, l) => s + (Number(l.coutTotalFo) || 0), 0);
  const heures = membres.reduce((s, l) => s + (Number(l.tempsTotalHeures) || 0), 0);
  const aFo = cout > 0;
  const aMo = heures > 0;
  return {
    type: "ligne",
    id: base.id,
    ids: membres.map((m) => m.id),
    groupe: groupe ? { id: groupe.id, nom: groupe.nom || "", nb: membres.length } : null,
    designation: String(base.designation || groupe?.nom || "").trim(),
    detail: base.detail || "",
    reference: base.reference || "",
    unite: base.unite || "",
    quantite: Number(base.quantite) || 0,
    cout,
    heures,
    // fo+mo | fo | mo | simple (rien de chiffré : un seul curseur d'avancement)
    mode: aFo && aMo ? "fo+mo" : aFo ? "fo" : aMo ? "mo" : "simple",
    pctFo: moyenne(membres, "coutTotalFo", pctFoDe),
    pctMo: moyenne(membres, "tempsTotalHeures", pctMoDe),
    note: porteNote.noteTerrain || "",
    noteId: porteNote.id,
  };
}

export function pctItem(it, tauxMo) {
  if (it.mode === "fo") return it.pctFo;
  if (it.mode === "mo") return it.pctMo;
  if (it.mode === "simple") return Math.max(it.pctFo, it.pctMo);
  const poidsMo = it.heures * (tauxMo || 0);
  const total = it.cout + poidsMo;
  return total > 0 ? (it.cout * it.pctFo + poidsMo * it.pctMo) / total : Math.max(it.pctFo, it.pctMo);
}
export const estFait = (it) => pctItem(it, 1) >= 99.95;

// lignesDevis : lignes elecLignes d'un devis, triées par ordre.
export function construireTour(lignesDevis, groupes) {
  const groupeParId = new Map((groupes || []).map((g) => [g.id, g]));
  const membresParGroupe = new Map();
  lignesDevis.forEach((l) => {
    if (!l.estPoste && l.groupeId && groupeParId.has(l.groupeId)) {
      if (!membresParGroupe.has(l.groupeId)) membresParGroupe.set(l.groupeId, []);
      membresParGroupe.get(l.groupeId).push(l);
    }
  });
  const vus = new Set();
  const items = [];
  lignesDevis.forEach((l) => {
    if (l.estPoste) {
      const texte = String(l.designation || "").trim();
      if (texte) items.push({ type: "poste", id: l.id, texte, code: l.code || "", niveau: l.profondeur || 0 });
      return;
    }
    if (l.groupeId && groupeParId.has(l.groupeId)) {
      const g = groupeParId.get(l.groupeId);
      if (vus.has(g.id)) return;
      vus.add(g.id);
      const membres = membresParGroupe.get(g.id) || [l];
      const rep = g.ligneRepresentativeId ? membres.find((m) => m.id === g.ligneRepresentativeId) : null;
      items.push(itemLigne(rep || { id: "g_" + g.id, designation: g.nom }, membres, g));
      return;
    }
    const texte = String(l.designation || "").trim();
    if (estLigneSomme(l)) {
      // Tête de regroupement de la minute : un titre, jamais une ligne à avancer.
      if (texte) items.push({ type: "poste", id: l.id, texte, code: "", niveau: RE_CHAPITRE.test(texte) ? 0 : 1 });
      return;
    }
    if (l.informative) {
      if (!texte) return;
      items.push(
        (Number(l.quantite) || 0) >= 1
          ? { type: "poste", id: l.id, texte, code: "", niveau: 1, sousTitre: true }
          : { type: "commentaire", id: l.id, texte }
      );
      return;
    }
    items.push(itemLigne(l, [l], null));
  });
  return items;
}

// Avancement pondéré d'une liste d'items « ligne » (FO en €, MO en heures × taux).
export function avancementItems(items, tauxMo) {
  let total = 0;
  let fait = 0;
  let n = 0;
  let nFaites = 0;
  items.forEach((it) => {
    if (it.type !== "ligne") return;
    const poids = it.cout + it.heures * (tauxMo || 0) || 1;
    total += poids;
    fait += (poids * pctItem(it, tauxMo)) / 100;
    n += 1;
    if (estFait(it)) nFaites += 1;
  });
  return { pct: total > 0 ? (fait / total) * 100 : 0, n, nFaites };
}

// Pour chaque poste : avancement et nombre de lignes de son sous-arbre
// (jusqu'au prochain poste de niveau inférieur ou égal).
export function resumesPostes(items, tauxMo) {
  const res = new Map();
  items.forEach((it, i) => {
    if (it.type !== "poste") return;
    let j = i + 1;
    while (j < items.length && !(items[j].type === "poste" && items[j].niveau <= it.niveau)) j++;
    res.set(it.id, avancementItems(items.slice(i + 1, j), tauxMo));
  });
  return res;
}

// Champs à écrire pour fixer l'avancement d'un item.
export function majAvancement(it, { fo, mo }) {
  const maj = {};
  if (it.mode === "simple") {
    const v = borne(fo ?? mo);
    maj.avancementFo = v;
    maj.avancementMo = v;
    return maj;
  }
  if (fo != null && (it.mode === "fo" || it.mode === "fo+mo")) maj.avancementFo = borne(fo);
  if (mo != null && (it.mode === "mo" || it.mode === "fo+mo")) maj.avancementMo = borne(mo);
  return maj;
}
