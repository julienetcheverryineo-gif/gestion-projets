import * as XLSX from "xlsx";
import { normaliserOtp } from "./parseSapCommandes";

// États de facturation (liste du fichier de suivi « Paramétrage », regroupée).
export const ETATS_FACTURATION = [
  "Attente commande",
  "Attente PV",
  "PV signé",
  "À facturer",
  "Facturation partielle",
  "Soldé",
  "Archivé",
];

const sansAccent = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// « Archive 2025 » -> « Archivé », « A Facturer » -> « À facturer »…
export function normaliserEtat(brut) {
  const t = sansAccent(brut);
  if (!t) return "";
  if (t.startsWith("archive")) return "Archivé";
  if (t.includes("attente commande")) return "Attente commande";
  if (t.includes("attente pv")) return "Attente PV";
  if (t.includes("pv sign")) return "PV signé";
  if (t.includes("partielle")) return "Facturation partielle";
  if (t.includes("facturer")) return "À facturer";
  if (t.includes("sold")) return "Soldé";
  return "";
}

// État déduit de SAP (reste à facturer) quand rien n'est saisi à la main.
export function etatAutoSap(commande) {
  const facture = commande.montantHt - commande.resteHt;
  if (commande.resteHt <= 0.005 && commande.montantHt > 0) return "Soldé";
  if (facture > 0.005) return "Facturation partielle";
  return "À facturer";
}

const texte = (v) => (v === null || v === undefined ? "" : String(v).replace(/\r/g, "").trim());
const nombre = (v) => {
  const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && v !== "" && v !== null ? n : 0;
};
const iso = (d) =>
  d instanceof Date && !Number.isNaN(d.getTime()) ? new Date(d.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10) : "";
const cleCmd = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Lit la feuille « Liste des devis » du fichier de suivi (Chiffrage … .xlsx).
export function lireFichierSuivi(buffer) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const nom = wb.SheetNames.find((n) => sansAccent(n).includes("devis")) || wb.SheetNames[0];
  const lignes = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: "", raw: true });
  const entete = (lignes[0] || []).map(sansAccent);
  const col = (...motifs) => entete.findIndex((h) => motifs.some((m) => h.includes(m)));
  const idx = {
    devis: col("devis"),
    date: col("date"),
    designation: col("designation"),
    etatChantier: col("etat chantier"),
    montantDevis: col("montant devis"),
    compte: col("n° compte", "compte"),
    commande: col("n° commande"),
    montantCommande: col("montant commande"),
    etat: col("etat d'avancement", "avancement"),
    factures: col("facture"),
    commentaire: col("commentaire"),
  };
  if (idx.devis < 0 || idx.compte < 0) throw new Error("Fichier non reconnu (colonnes « Devis » et « N° Compte » attendues).");
  const sortie = [];
  for (let i = 1; i < lignes.length; i++) {
    const r = lignes[i];
    const devis = texte(r[idx.devis]);
    if (!devis) continue;
    sortie.push({
      devis,
      date: r[idx.date] instanceof Date ? iso(r[idx.date]) : "",
      designation: texte(r[idx.designation]),
      etatChantier: texte(r[idx.etatChantier]),
      montantDevis: nombre(r[idx.montantDevis]),
      compte: texte(r[idx.compte]),
      commande: texte(r[idx.commande]),
      montantCommande: nombre(r[idx.montantCommande]),
      etat: normaliserEtat(r[idx.etat]) || "",
      etatBrut: texte(r[idx.etat]),
      factures: texte(r[idx.factures]),
      commentaire: texte(r[idx.commentaire]),
    });
  }
  return sortie;
}

// Retient les lignes du chantier (même OTP) et les rattache aux commandes SAP :
// par n° de commande client (référence SAP ou doc. de vente), sinon par montant
// de commande identique et unique. Le reste est conservé tel quel (« libres »).
export function rattacherSuivi(lignesFichier, otp, commandes) {
  const cible = normaliserOtp(otp);
  const miennes = lignesFichier.filter((l) => l.compte && normaliserOtp(l.compte) === cible);
  const lignes = {};
  const libres = [];
  const fusion = (cle, l) => {
    const cur = lignes[cle];
    const com = l.commentaire ? (l.devis ? l.devis + " : " : "") + l.commentaire : "";
    if (!cur) {
      lignes[cle] = { etat: l.etat, cmdClient: l.commande, devis: l.devis, commentaire: com };
      return;
    }
    if (!cur.etat || cur.etat === "Archivé") cur.etat = l.etat || cur.etat;
    cur.devis = [cur.devis, l.devis].filter(Boolean).join(", ");
    cur.commentaire = [cur.commentaire, com].filter(Boolean).join(" · ");
  };
  miennes.forEach((l) => {
    const k = cleCmd(l.commande);
    let c = null;
    if (k.length >= 4)
      c = commandes.find((x) => cleCmd(x.reference).includes(k) || cleCmd(x.docVente) === k || cleCmd(x.docVente).endsWith(k));
    if (!c && l.montantCommande > 0) {
      const memes = commandes.filter((x) => Math.abs(x.montantHt - l.montantCommande) < 0.01);
      if (memes.length === 1) c = memes[0];
    }
    if (c) fusion(c.cle, l);
    else
      libres.push({
        devis: l.devis,
        date: l.date,
        designation: l.designation,
        etatChantier: l.etatChantier,
        montantDevis: l.montantDevis,
        commande: l.commande,
        montantCommande: l.montantCommande,
        etat: l.etat,
        factures: l.factures,
        commentaire: l.commentaire,
      });
  });
  return { lignes, libres, nbLignesFichier: lignesFichier.length, nbChantier: miennes.length };
}
