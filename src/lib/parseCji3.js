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

export function analyserCji3(texte) {
  const lignes = String(texte || "").split(/\r?\n/);
  const iEntete = lignes.findIndex((l) => /\|\s*Elt d'OTP/.test(l));
  if (iEntete < 0) throw new Error("Fichier CJI3 non reconnu (colonne « Elt d'OTP » introuvable).");
  const cols = lignes[iEntete].split("|").map((c) => c.trim());
  const idx = (re) => cols.findIndex((c) => re.test(c));
  const iNat = idx(/^Nat\.cpt\./);
  const iVal = idx(/^Val\.\/D\.Tra/);
  const iQte = idx(/^Quantit/);
  const iUq = idx(/^UQ$/);
  const iOtp = idx(/^Elt d'OTP/);
  if (iNat < 0 || iVal < 0) throw new Error("Colonnes « Nat.cpt. » / « Val./D.Tra » absentes : ajoutez-les à la mise en page du CJI3.");
  const res = { mo: {}, achats: 0, autresFrais: 0, fra: 0, produits: 0, nbEcritures: 0, otp: "" };
  for (let i = iEntete + 1; i < lignes.length; i++) {
    const l = lignes[i];
    if (!/^\|\s+[A-Z]\.[A-Z0-9]/.test(l)) continue; // ligne d'écriture (OTP renseigné)
    const c = l.split("|").map((x) => x.trim());
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
