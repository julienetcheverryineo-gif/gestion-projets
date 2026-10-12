// Export SAP CJI3 (postes individuels réels d'un projet) : cumul comptable par
// grande famille, tel que l'écran RàE le présente (Cpta Cum Trv).
//  - 9430xxxx : main d'œuvre par type d'activité (heures + €)
//  - 60xxxxxx : achats (factures MM + OD analytiques, hors ME2J)
//  - 62 / 64 / 9000xxxx : autres frais
//  - 941xxxxx : FRA ; 70xxxxxx : produits (facturé, en négatif)
const nombre = (s) => {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  const neg = t.endsWith("-");
  const v = Number(t.replace(/-$/, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? (neg ? -v : v) : 0;
};

export function analyserCji3(texte, otpFiltre = "") {
  const lignes = String(texte || "").split(/\r?\n/);
  // La colonne de l'OTP s'appelle « Elt d'OTP » ou « Objet » selon la mise en page.
  const iEntete = lignes.findIndex((l) => /\|\s*(Elt d'OTP|Objet)\s*\|/.test(l) && /Nat\.cpt\./.test(l));
  if (iEntete < 0) throw new Error("Fichier CJI3 non reconnu (colonnes « Objet / Elt d'OTP » et « Nat.cpt. » introuvables).");
  const cols = lignes[iEntete].split("|").map((c) => c.trim());
  const idx = (re) => cols.findIndex((c) => re.test(c));
  const iNat = idx(/^Nat\.cpt\./);
  const iVal = idx(/^Val\.\/D\.Tra/);
  const iQte = idx(/^Quantit/);
  const iUq = idx(/^UQ$/);
  const iOtp = idx(/^(Elt d'OTP|Objet)$/);
  if (iNat < 0 || iVal < 0) throw new Error("Colonnes « Nat.cpt. » / « Val./D.Tra » absentes : ajoutez-les à la mise en page du CJI3.");
  const cols2 = (lignes[iEntete + 1] || "").split("|").map((c) => c.trim());
  const idx2 = (re) => cols2.findIndex((c) => re.test(c));
  const iTypePiece = idx2(/^D.{1,3}sign type pi/);
  const iTexte = idx2(/^D.{1,3}signation$/);
  const iDocAchat = idx2(/^Doc achat/);
  // Date et désignation du compte : première ou seconde ligne d'en-tête selon la mise en page.
  const iDate1 = idx(/^Date cpt/);
  const iDate2 = idx2(/^Date cpt/);
  const iDes1 = idx(/^D.{1,3}s(ign)?\.nat/);
  const iDes2 = idx2(/^D.{1,3}s(ign)?\.nat/);
  const norm = (o) => String(o || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cibleOtp = norm(otpFiltre);
  const res = { mo: {}, achats: 0, autresFrais: 0, fra: 0, produits: 0, nbEcritures: 0, otp: "", ecritures: [] };
  for (let i = iEntete + 1; i < lignes.length; i++) {
    const l = lignes[i];
    if (!l.startsWith("|")) continue;
    const c = l.split("|").map((x) => x.trim());
    if (!/^[A-Z]\.[A-Z0-9]/.test(c[iOtp] || "")) continue; // ligne d'écriture (OTP renseigné)
    if (cibleOtp && !norm(c[iOtp]).startsWith(cibleOtp)) {
      i++; // saute la seconde ligne de l'écriture
      continue;
    }
    const c2 = (lignes[i + 1] || "").split("|").map((x) => x.trim());
    const nat = c[iNat] || "";
    const val = nombre(c[iVal]);
    if (!res.otp && iOtp >= 0) res.otp = c[iOtp];
    res.nbEcritures++;
    if (/^9430/.test(nat)) {
      const code = nat.slice(4).toUpperCase();
      const m = (res.mo[code] ||= { h: 0, eur: 0 });
      m.eur += val;
      if (iQte >= 0 && /^H$/i.test(c[iUq] || "")) m.h += nombre(c[iQte]);
    } else if (/^60/.test(nat)) res.achats += val;
    else if (/^(62|64|9000)/.test(nat)) res.autresFrais += val;
    else if (/^941/.test(nat)) res.fra += val;
    else if (/^70/.test(nat)) res.produits += val;
    if (!/^9430/.test(nat) && !/^92/.test(nat)) {
      res.ecritures.push({
        nat,
        designation: iDes1 >= 0 ? c[iDes1] : iDes2 >= 0 ? c2[iDes2] || "" : "",
        montant: val,
        date: iDate1 >= 0 ? c[iDate1] : iDate2 >= 0 ? c2[iDate2] || "" : "",
        typePiece: iTypePiece >= 0 ? c2[iTypePiece] || "" : "",
        texte: iTexte >= 0 ? c2[iTexte] || "" : "",
        docAchat: iDocAchat >= 0 ? c2[iDocAchat] || "" : "",
      });
    }
  }
  const arrondi = (v) => Math.round(v * 100) / 100;
  Object.values(res.mo).forEach((m) => {
    m.h = arrondi(m.h);
    m.eur = arrondi(m.eur);
  });
  res.achats = arrondi(res.achats);
  res.autresFrais = arrondi(res.autresFrais);
  res.fra = arrondi(res.fra);
  res.produits = arrondi(res.produits);
  res.moTotal = arrondi(Object.values(res.mo).reduce((s, m) => s + m.eur, 0));
  res.directTotal = arrondi(res.moTotal + res.achats + res.autresFrais);
  return res;
}
