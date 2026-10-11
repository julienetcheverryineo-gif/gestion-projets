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
const COL_DEFAUT = {
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

// Positions des colonnes lues dans la ligne d'en-tête quand elle est présente
// (les accents arrivent parfois corrompus : on tolère 1 à 4 caractères). Sans
// en-tête reconnu, on retombe sur les positions fixes de COL.
function colonnesDepuisEntete(lignes) {
  const entete = lignes.find((l) => l.startsWith("|") && /doc\. vente/i.test(l) && /elt d'otp/i.test(l));
  if (!entete) return COL_DEFAUT;
  const h = entete.split("|").map((x) => x.trim().toLowerCase());
  const trouve = (re, defaut, depuis = 0) => {
    const i = h.findIndex((x, k) => k >= depuis && re.test(x));
    return i >= 0 ? i : defaut;
  };
  const desig = h.map((x, k) => (/^d.{1,4}signation$/.test(x) ? k : -1)).filter((k) => k >= 0);
  const typeFacture = trouve(/^tyfac$/, COL_DEFAUT.typeFacture);
  return {
    otp: trouve(/^elt d'otp$/, COL_DEFAUT.otp),
    docVente: trouve(/^doc\. vente$/, COL_DEFAUT.docVente),
    reference: trouve(/^r.{1,4}f.{1,4}rence$/, COL_DEFAUT.reference),
    motif: trouve(/^motif/, COL_DEFAUT.motif),
    designation: desig.length ? desig[0] : COL_DEFAUT.designation,
    designation3: desig.length > 2 ? desig[desig.length - 1] : COL_DEFAUT.designation3,
    nomDo: trouve(/^nom do$/, COL_DEFAUT.nomDo),
    montantPoste: trouve(/^mt post ht$/, COL_DEFAUT.montantPoste),
    resteFacturer: trouve(/^res fact p$/, COL_DEFAUT.resteFacturer),
    poste: trouve(/^poste$/, COL_DEFAUT.poste),
    montantFacture: trouve(/^mt fact ht$/, COL_DEFAUT.montantFacture),
    typeFacture,
    libelleFacture: typeFacture + 1,
    dateFacture: trouve(/^date fact\.$/, COL_DEFAUT.dateFacture),
    montantTtc: trouve(/^mt facttc$/, COL_DEFAUT.montantTtc),
    numeroFacture: trouve(/^facture$/, COL_DEFAUT.numeroFacture),
    creeLe: trouve(/^cr.{1,4}\s*le$/, COL_DEFAUT.creeLe),
  };
}

export function analyserSapCommandes(texte) {
  const commandes = new Map();
  const factures = [];
  const toutes = texte.split(/\r\n|\r|\n/);
  const COL = colonnesDepuisEntete(toutes);
  toutes.forEach((ligne) => {
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
