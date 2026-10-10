import logoUrl from "../assets/logo-ineo-situation.png";
import { montantAvancement, montantMarche, pctCumule, totalCumule } from "./situations";

// Fichier de situation de travaux (.xlsx) : même présentation que le modèle
// du service (en-tête, tableau turquoise, totaux de chapitre en rouge,
// récapitulatif des situations). Police Roboto sur toutes les cellules.
const POLICE = "Roboto";
const AGENCE_NOM = "INEO AQUITAINE - Agence des Landes";
const AGENCE_ADRESSE = "397 rue Bernard Palissy - 40990 SAINT PAUL LES DAX";
const TURQUOISE = "FF33CCCC";
const NUM = "#,##0.00";
const FIN = { style: "thin" };
const CADRE = { left: FIN, right: FIN, top: FIN, bottom: FIN };

const arrondi2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function lettre(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function dateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

async function chargerLogo() {
  try {
    const rep = await fetch(logoUrl);
    return await rep.arrayBuffer();
  } catch {
    return null;
  }
}

// Construit le classeur et renvoie un Blob.
export async function genererFichierSituation({ chantier, rows, situations, indexSituation, tauxTva }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pilotage de projets";

  const marche = montantMarche(rows);
  const nb = indexSituation + 1;
  const tva = (Number(tauxTva) || 0) / 100;
  const cumuls = Array.from({ length: nb }, (_, i) => totalCumule(rows, situations, i));
  const periodes = cumuls.map((c, i) => arrondi2(c - (i > 0 ? cumuls[i - 1] : 0)));

  // ---------- Récapitulatif ----------
  const rec = wb.addWorksheet("Récapitulatif", { views: [{ showGridLines: false }] });
  rec.columns = [{ width: 3 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }];
  rec.mergeCells("B3:F3");
  const titreRec = rec.getCell("B3");
  titreRec.value = "RECAPITULATIF";
  titreRec.font = { name: POLICE, size: 14, bold: true };
  titreRec.alignment = { horizontal: "center", vertical: "middle" };
  rec.mergeCells("B5:B6");
  rec.mergeCells("C5:C6");
  rec.mergeCells("D5:F5");
  rec.getCell("B5").value = "Période";
  rec.getCell("C5").value = "Montant\nmarché (H.T.)";
  rec.getCell("D5").value = "Montant pour la période";
  ["D6", "E6", "F6"].forEach((a, i) => (rec.getCell(a).value = ["H.T.", "TVA", "T.T.C."][i]));
  ["B5", "C5", "D5", "E5", "F5", "B6", "C6", "D6", "E6", "F6"].forEach((a) => {
    const c = rec.getCell(a);
    c.font = { name: POLICE, size: 10, bold: false };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = CADRE;
  });
  let ligneRec = 7;
  for (let i = 0; i < nb; i++) {
    const ht = periodes[i];
    const tv = arrondi2(ht * tva);
    const vals = [`Situation ${situations[i].numero}`, marche, ht, tv, arrondi2(ht + tv)];
    vals.forEach((v, k) => {
      const c = rec.getCell(ligneRec, 2 + k);
      c.value = v;
      c.font = { name: POLICE, size: 10 };
      c.border = CADRE;
      if (k > 0) {
        c.numFmt = NUM;
        c.alignment = { horizontal: "right" };
      }
    });
    ligneRec++;
  }
  const debutRec = 7;
  const finRec = ligneRec - 1;
  rec.getCell(ligneRec, 2).value = "TOTAL";
  [4, 5, 6].forEach((col) => {
    const L = lettre(col);
    rec.getCell(ligneRec, col).value = {
      formula: `SUM(${L}${debutRec}:${L}${finRec})`,
      result: arrondi2(
        periodes.reduce((s, v) => s + (col === 4 ? v : col === 5 ? arrondi2(v * tva) : arrondi2(v + arrondi2(v * tva))), 0)
      ),
    };
  });
  for (let col = 2; col <= 6; col++) {
    const c = rec.getCell(ligneRec, col);
    c.font = { name: POLICE, size: 10, bold: true };
    c.border = CADRE;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    if (col > 2) {
      c.numFmt = NUM;
      c.alignment = { horizontal: "right" };
    }
  }
  rec.getCell(ligneRec + 2, 3).value = "Taux de TVA utilisé";
  rec.getCell(ligneRec + 2, 4).value = tva;
  rec.getCell(ligneRec + 2, 4).numFmt = "0.00%";
  rec.getCell(ligneRec + 2, 3).font = { name: POLICE, size: 10 };
  rec.getCell(ligneRec + 2, 4).font = { name: POLICE, size: 10 };

  // ---------- Feuille de la situation ----------
  const sh = wb.addWorksheet("Situation " + situations[indexSituation].numero, {
    views: [{ showGridLines: false, state: "frozen", ySplit: 12 }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  });
  // A Item | B Description | C Unité | D Quantité | E Prix unitaire | F Total | puis 4 colonnes par situation
  const NB_FIXES = 6;
  const colSit = (i) => NB_FIXES + 1 + i * 4; // première colonne du bloc de la situation i
  const largeurs = [8, 52, 7, 9, 13, 15];
  for (let i = 0; i < nb; i++) largeurs.push(11, 15, 13, 15);
  sh.columns = largeurs.map((width) => ({ width }));
  // Situations précédentes : colonnes masquées (comme dans le modèle).
  for (let i = 0; i < indexSituation; i++) for (let k = 0; k < 4; k++) sh.getColumn(colSit(i) + k).hidden = true;
  const derniere = colSit(indexSituation);
  const finCol = derniere + 3;

  const logo = await chargerLogo();
  if (logo) {
    const id = wb.addImage({ buffer: logo, extension: "png" });
    sh.addImage(id, { tl: { col: 0.1, row: 0.2 }, ext: { width: 185, height: 57 } });
  }
  const fontBase = (extra = {}) => ({ name: POLICE, size: 10, ...extra });
  sh.getCell("A6").value = AGENCE_NOM;
  sh.getCell("A6").font = fontBase({ size: 11, bold: true });
  sh.getCell("A7").value = AGENCE_ADRESSE;
  sh.getCell("A7").font = fontBase({ size: 11 });
  sh.getCell(2, derniere).value = chantier?.client || "";
  sh.getCell(2, derniere).font = fontBase({ size: 14, bold: true });
  sh.mergeCells(9, 1, 9, finCol);
  const titre = sh.getCell(9, 1);
  titre.value = chantier?.nom || "";
  titre.font = fontBase({ size: 14, bold: true });
  titre.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sh.getRow(9).height = 26;

  // En-tête du tableau (lignes 11-12)
  const entetes = ["Item", "Description", "Unité", "Quantité", "Prix de vente\npar unité", "Total"];
  entetes.forEach((t, k) => {
    sh.mergeCells(11, k + 1, 12, k + 1);
    sh.getCell(11, k + 1).value = t;
  });
  for (let i = 0; i < nb; i++) {
    const c0 = colSit(i);
    sh.mergeCells(11, c0, 11, c0 + 3);
    sh.getCell(11, c0).value = "Situation " + situations[i].numero;
    ["Avancement\ncumulé (%)", "Montant\navancement", "Avancement\npour la période", "Montant pour\nla période"].forEach((t, k) => {
      sh.getCell(12, c0 + k).value = t;
    });
  }
  for (let col = 1; col <= finCol; col++) {
    for (const r of [11, 12]) {
      const c = sh.getCell(r, col);
      c.font = fontBase({ size: 8, bold: r === 11 });
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TURQUOISE } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = CADRE;
    }
  }
  sh.getRow(11).height = 16;
  sh.getRow(12).height = 34;

  // Corps
  let r = 13;
  const bordureLat = { left: FIN, right: FIN };
  const styleLigne = (ligne, opts = {}) => {
    for (let col = 1; col <= finCol; col++) {
      const c = sh.getCell(ligne, col);
      c.border = bordureLat;
      if (!c.font?.name || c.font.name !== POLICE) c.font = fontBase(opts.font);
    }
  };
  let chapitreDebut = null;
  const lignesChapitre = [];
  const totalChapitre = () => {
    if (chapitreDebut == null || lignesChapitre.length === 0) return;
    const l = r;
    sh.getCell(l, 2).value = "Total chapitre : ";
    const sommes = (col, calc) => {
      const L = lettre(col);
      sh.getCell(l, col).value = {
        formula: lignesChapitre.map((x) => `${L}${x.ligne}`).join("+"),
        result: arrondi2(lignesChapitre.reduce((s, x) => s + calc(x), 0)),
      };
      sh.getCell(l, col).numFmt = NUM;
    };
    sommes(6, (x) => x.row.total);
    for (let i = 0; i < nb; i++) {
      const c0 = colSit(i);
      sommes(c0 + 1, (x) => montantAvancement(x.row, pctCumule(situations, i, x.row.id)));
      sommes(c0 + 3, (x) =>
        montantAvancement(x.row, pctCumule(situations, i, x.row.id)) -
        (i > 0 ? montantAvancement(x.row, pctCumule(situations, i - 1, x.row.id)) : 0)
      );
    }
    for (let col = 1; col <= finCol; col++) {
      const c = sh.getCell(l, col);
      c.font = fontBase({ size: 11, bold: true, color: { argb: "FFFF0000" } });
      c.border = bordureLat;
      if (col > 2) c.alignment = { horizontal: "right" };
    }
    r++;
    sh.getRow(r).height = 8;
    styleLigne(r);
    r++;
    lignesChapitre.length = 0;
  };

  rows.forEach((row) => {
    if (row.type === "chapitre") {
      totalChapitre();
      chapitreDebut = r;
      sh.getCell(r, 2).value = row.texte;
      styleLigne(r);
      sh.getCell(r, 2).font = fontBase({ size: 12, bold: true, color: { argb: "FF003366" } });
      sh.getCell(r, 2).alignment = { wrapText: true, vertical: "bottom" };
      r++;
      return;
    }
    if (row.type === "titre") {
      if (chapitreDebut == null) chapitreDebut = r;
      sh.getCell(r, 2).value = row.texte;
      styleLigne(r);
      sh.getCell(r, 2).font = fontBase({ size: 10, bold: true });
      sh.getCell(r, 2).alignment = { wrapText: true, vertical: "bottom" };
      r++;
      return;
    }
    // ligne facturable
    if (chapitreDebut == null) chapitreDebut = r;
    styleLigne(r);
    sh.getCell(r, 1).value = row.code || "";
    sh.getCell(r, 1).alignment = { horizontal: "center", vertical: "top" };
    sh.getCell(r, 2).value = row.texte;
    sh.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    sh.getCell(r, 3).value = row.unite;
    sh.getCell(r, 3).alignment = { horizontal: "center", vertical: "top" };
    sh.getCell(r, 4).value = row.quantite;
    sh.getCell(r, 4).alignment = { horizontal: "center", vertical: "top" };
    sh.getCell(r, 5).value = row.pu;
    sh.getCell(r, 5).numFmt = NUM;
    sh.getCell(r, 6).value = { formula: `ROUND(D${r}*E${r},2)`, result: row.total };
    sh.getCell(r, 6).numFmt = NUM;
    for (let i = 0; i < nb; i++) {
      const c0 = colSit(i);
      const pct = pctCumule(situations, i, row.id);
      const montant = montantAvancement(row, pct);
      const precedent = i > 0 ? pctCumule(situations, i - 1, row.id) : 0;
      sh.getCell(r, c0).value = pct / 100;
      sh.getCell(r, c0).numFmt = "0.00%";
      if (i === indexSituation) sh.getCell(r, c0).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF99" } };
      sh.getCell(r, c0 + 1).value = { formula: `ROUND(${lettre(c0)}${r}*$F${r},2)`, result: montant };
      sh.getCell(r, c0 + 1).numFmt = NUM;
      sh.getCell(r, c0 + 2).value = { formula: `${lettre(c0)}${r}${i > 0 ? `-${lettre(colSit(i - 1))}${r}` : ""}`, result: (pct - precedent) / 100 };
      sh.getCell(r, c0 + 2).numFmt = "0.00%";
      sh.getCell(r, c0 + 3).value = {
        formula: `${lettre(c0 + 1)}${r}${i > 0 ? `-${lettre(colSit(i - 1) + 1)}${r}` : ""}`,
        result: arrondi2(montant - montantAvancement(row, precedent)),
      };
      sh.getCell(r, c0 + 3).numFmt = NUM;
    }
    for (let col = 3; col <= finCol; col++) {
      const c = sh.getCell(r, col);
      if (col >= 5) c.alignment = { horizontal: "right", vertical: "top" };
    }
    lignesChapitre.push({ ligne: r, row });
    r++;
  });
  totalChapitre();

  // Montant total + TVA + TTC (période courante)
  const totalHt = marche;
  const cumulCourant = cumuls[indexSituation];
  const periode = periodes[indexSituation];
  const blocTotal = (libelle, valeurs, ligne) => {
    sh.mergeCells(ligne, 1, ligne, 5);
    sh.getCell(ligne, 1).value = libelle;
    for (let col = 1; col <= finCol; col++) {
      const c = sh.getCell(ligne, col);
      c.font = fontBase({ size: 12, bold: true, color: { argb: "FF0000FF" } });
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC0C0C0" } };
      c.border = CADRE;
    }
    sh.getCell(ligne, 1).alignment = { horizontal: "right" };
    valeurs.forEach(([col, v]) => {
      sh.getCell(ligne, col).value = v;
      sh.getCell(ligne, col).numFmt = NUM;
    });
  };
  const premiereLigne = 13;
  const derniereLigne = r - 1;
  const sommeCol = (col) => ({ formula: `SUMIF($B$${premiereLigne}:$B$${derniereLigne},"Total chapitre : ",${lettre(col)}${premiereLigne}:${lettre(col)}${derniereLigne})` });
  const c1 = colSit(indexSituation);
  blocTotal(
    "MONTANT TOTAL",
    [
      [6, { ...sommeCol(6), result: totalHt }],
      [c1 + 1, { ...sommeCol(c1 + 1), result: cumulCourant }],
      [c1 + 3, { ...sommeCol(c1 + 3), result: periode }],
    ],
    r
  );
  const ligneTotal = r;
  r++;
  blocTotal("TVA (" + (tauxTva ?? 20) + "%)", [[c1 + 3, { formula: `ROUND(${lettre(c1 + 3)}${ligneTotal}*${tva},2)`, result: arrondi2(periode * tva) }]], r);
  r++;
  blocTotal("MONTANT TOTAL TTC", [[c1 + 3, { formula: `${lettre(c1 + 3)}${ligneTotal}+${lettre(c1 + 3)}${ligneTotal + 1}`, result: arrondi2(periode + arrondi2(periode * tva)) }]], r);
  r += 2;

  // Montant du mois
  const precedent = indexSituation > 0 ? cumuls[indexSituation - 1] : 0;
  const lignesBas = [
    ["MONTANT AVANCEMENT HT", cumulCourant],
    ["SITUATION A DEDUIRE HT", precedent],
    ["MONTANT DU MOIS HT", arrondi2(cumulCourant - precedent)],
    ["TVA (" + (tauxTva ?? 20) + "%)", arrondi2((cumulCourant - precedent) * tva)],
    ["MONTANT DU MOIS TTC", arrondi2(cumulCourant - precedent + arrondi2((cumulCourant - precedent) * tva))],
  ];
  const medium = { style: "medium" };
  const debutBas = r;
  lignesBas.forEach(([lib, v], k) => {
    sh.mergeCells(r, 1, r, 2);
    sh.getCell(r, 1).value = lib;
    const e = sh.getCell(r, 3);
    sh.mergeCells(r, 3, r, 5);
    e.value = v;
    e.numFmt = NUM;
    e.alignment = { horizontal: "right" };
    [1, 2, 3, 4, 5].forEach((col) => {
      const c = sh.getCell(r, col);
      c.font = fontBase({ size: 11, bold: k === 2 || k === 4 });
      c.border = {
        top: k === 0 ? medium : FIN,
        bottom: k === lignesBas.length - 1 ? medium : FIN,
        left: col === 1 ? medium : undefined,
        right: col === 5 ? medium : undefined,
      };
    });
    r++;
  });
  sh.getCell(debutBas, 7).value = `Le ${dateFr(situations[indexSituation].date)}${situations[indexSituation].auteur ? ", " + situations[indexSituation].auteur : ""}`;
  sh.getCell(debutBas, 7).font = fontBase({ size: 10, italic: true });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
