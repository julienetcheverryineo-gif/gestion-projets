// Lecture de l'export SAP « commandes clients / facturation » (transaction
// ZSD_ADV) : même principe que la table Facturation de GOAT. C'est un
// rapport imprimé à colonnes séparées par « | », une ligne par échéance ou
// facture ; la ligne d'en-tête d'un poste porte « Mt post HT » (montant du
// poste) et « Res fact P » (reste à facturer), les lignes de facture portent
// un type de facture (ZF2 = facture, ZS1 = annulation) et « Mt fact HT ».
//
// Les colonnes sont lues par position (identique d'un export à l'autre) ;
// les libellés d'en-tête arrivent parfois avec des accents corrompus, donc
// on ne s'y fie pas.
const COL = {
  otp: 1,
  docVente: 2,
  reference: 5,
  motif: 6,
  designation: 7,
  nomDo: 8,
  montantPoste: 10,
  resteFacturer: 11,
  poste: 12,
  montantFacture: 13,
  typeFacture: 25,
  libelleFacture: 26,
  dateFacture: 27,
  montantTtc: 28,
  numeroFacture: 60,
  designation3: 57,
  creeLe: 58,
};

// "170.000,00" -> 170000 ; "4.339,36-" (signe à droite) -> -4339.36
function nombreSap(texte) {
  const t = String(texte ?? "").replace(/\s/g, "");
  if (!t) return 0;
  const negatif = t.endsWith("-");
  const n = parseFloat(t.replace(/-$/, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return negatif ? -n : n;
}

export const normaliserOtp = (v) => String(v ?? "").toUpperCase().replace(/[\s.]/g, "");

export function analyserSapCommandes(texte) {
  const commandes = new Map();
  const factures = [];
  texte.split(/\r\n|\r|\n/).forEach((ligne) => {
    if (!ligne.startsWith("|")) return;
    const c = ligne.split("|");
    if (c.length < 29) return;
    const otp = normaliserOtp(c[COL.otp]);
    const doc = (c[COL.docVente] || "").trim();
    // Écarte l'en-tête, les sous-totaux (« * OTP ») et le total général (« ** »).
    if (!otp || !/^[A-Z0-9]+$/.test(otp) || !/^\d+$/.test(doc)) return;
    const poste = (c[COL.poste] || "").trim();
    const cle = doc + "_" + poste;
    const montant = nombreSap(c[COL.montantPoste]);
    const reste = nombreSap(c[COL.resteFacturer]);
    if (!commandes.has(cle) && (montant !== 0 || reste !== 0)) {
      commandes.set(cle, {
        cle,
        otp,
        docVente: doc,
        poste,
        reference: (c[COL.reference] || "").trim(),
        motif: (c[COL.motif] || "").trim(),
        designation: (c[COL.designation] || "").trim(),
        nomDo: (c[COL.nomDo] || "").trim(),
        designation3: (c[COL.designation3] || "").trim(),
        creeLe: (c[COL.creeLe] || "").trim(),
        montantHt: montant,
        resteHt: reste,
      });
    }
    const type = (c[COL.typeFacture] || "").trim();
    const factureHt = nombreSap(c[COL.montantFacture]);
    if (type && factureHt !== 0) {
      factures.push({
        cle,
        otp,
        docVente: doc,
        poste,
        type,
        libelle: (c[COL.libelleFacture] || "").trim(),
        numero: (c[COL.numeroFacture] || "").trim(),
        date: (c[COL.dateFacture] || "").trim(),
        montantHt: factureHt,
        montantTtc: nombreSap(c[COL.montantTtc]),
      });
    }
  });
  return { commandes: [...commandes.values()], factures };
}
