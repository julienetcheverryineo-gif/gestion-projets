import { useMemo, useState } from "react";
import { libelleTypeActivite, normaliserTypeActivite, inclutMaterielInterne } from "../lib/typesActiviteSap";
import { HEURES_PAR_JOUR_ZONE } from "../lib/tauxHoraires";

const eur = (v) =>
  (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const num = (v, d = 1) =>
  (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const ROUGE = "#c0392b";

// Bilan financier d'une affaire : matériel et main d'œuvre en euros.
// Budget MO = heures chiffrées × taux de chiffrage ; réel MO = heures
// pointées valorisées au taux de leur type d'activité (voir Import SAP).
const classeNeg = (v) => (v < -1e-9 ? { color: ROUGE, fontWeight: 600 } : {});

function Ligne({ cols, nom, champ, fort, retrait, sansReel, fmt = eur, style }) {
  return (
    <tr style={{ fontWeight: fort ? 700 : undefined, ...style }}>
      <td data-label="" style={retrait ? { paddingLeft: 24 } : undefined}>{nom}</td>
      {cols.map((c, i) => (
        <td key={i} data-label={["Prévu", "Réel (SAP)", "Atterrissage"][i]} style={classeNeg(c[champ])}>
          {sansReel && i === 1 ? "—" : c[champ] === null ? "—" : fmt(c[champ])}
        </td>
      ))}
    </tr>
  );
}

function LigneVals({ nom, vals }) {
  return (
    <tr>
      <td data-label="" style={{ paddingLeft: 24 }}>{nom}</td>
      {vals.map((v, i) => (
        <td key={i} data-label={["Prévu", "Réel (SAP)", "Atterrissage"][i]}>
          {eur(v)}
        </td>
      ))}
    </tr>
  );
}

export default function BilanFinancier({
  heuresMatInternePrevues,
  zone,
  montantZone,
  heuresZoneSap,
  heuresProductionPrevues,
  caCalcule,
  caSaisi,
  caNonSoumis,
  onChangerCa,
  foa: foaDefaut,
  pctSaisis,
  onChangerPct,
  budgetFo,
  pctFo,
  budgetHeures,
  budgetMoEuro,
  prevuMoLignes,
  detailFo,
  pctMo,
  achats,
  heures,
  taux,
  tauxChiffrage,
  tauxChiffrageDefaut,
}) {
  const [saisieCa, setSaisieCa] = useState({});
  const [saisiePct, setSaisiePct] = useState({});
  // % de la rubrique C : valeur propre à l'affaire, sinon paramètre FOA.
  const foa = { ...foaDefaut };
  ["prorata", "fraisDivers", "aleas", "negociation"].forEach((k) => {
    if (typeof pctSaisis?.[k] === "number") foa[k] = pctSaisis[k];
  });

  const reelFo = achats.reduce((s, a) => s + (Number(a.valNette) || 0), 0);

  const parType = useMemo(() => {
    const m = new Map();
    heures.forEach((h) => {
      const c = normaliserTypeActivite(h.typAct) || "—";
      if (!m.has(c)) m.set(c, { code: c, heures: 0 });
      m.get(c).heures += Number(h.heures) || 0;
    });
    return [...m.values()]
      .map((t) => {
        const tx = taux(t.code);
        return { ...t, taux: tx, cout: tx === null ? null : t.heures * tx };
      })
      .sort((a, b) => b.heures - a.heures);
  }, [heures, taux]);

  const heuresSansTaux = parType.filter((t) => t.taux === null).reduce((s, t) => s + t.heures, 0);
  const reelMo = parType.reduce((s, t) => s + (t.cout || 0), 0);

  const tx = tauxChiffrage ?? tauxChiffrageDefaut ?? 0;
  const budgetMo = budgetMoEuro ?? budgetHeures * tx;

  // Trois colonnes comme la FOA : prévu (minute), réel (SAP), atterrissage
  // (réel + reste à faire au budget).
  const ca = caSaisi ?? caCalcule;
  const base = ca - (caNonSoumis || 0);
  const colonne = (aBrut, b, zoneEuro, heuresMi) => {
    const a = aBrut; // MO hors zone : base des frais divers
    const C_prorata = foa.prorata * ca;
    const C_divers = foa.fraisDivers * a;
    const C_aleas = foa.aleas * base;
    const C_nego = foa.negociation * base;
    const C_mi = foa.materielInterne * heuresMi;
    const C = C_prorata + C_divers + C_aleas + C_nego + C_mi;
    const D = foa.fra * (a + zoneEuro + b + C);
    const dep = a + zoneEuro + b + C + D;
    const brute = base - dep;
    const fg = foa.fg * base;
    const nette = brute - fg;
    return { a: a + zoneEuro, aHorsZone: a, zoneEuro, b, C, C_prorata, C_divers, C_aleas, C_nego, C_mi, D, dep, brute, fg, nette, k: base > 0 ? nette / base : null };
  };
  // Indemnités de zone (pointages J et F) : heures × montant de la zone ÷ 7,2 h.
  const tauxZone = montantZone ? montantZone / HEURES_PAR_JOUR_ZONE : 0;
  const heuresZoneReelles = (heuresZoneSap || []).reduce((s, h) => s + (Number(h.heures) || 0), 0);
  const zonePrevu = heuresProductionPrevues * tauxZone;
  const zoneReel = heuresZoneReelles * tauxZone;
  const zoneAtterr = zoneReel + zonePrevu * (1 - pctMo);
  const heuresMiReelles = parType.filter((t) => inclutMaterielInterne(t.code === "—" ? "I205" : t.code)).reduce((s, t) => s + t.heures, 0);
  const heuresMiAtterr = heuresMiReelles + heuresMatInternePrevues * (1 - pctMo);
  const prevu = colonne(budgetMo, budgetFo, zonePrevu, heuresMatInternePrevues);
  const reel = colonne(reelMo, reelFo, zoneReel, heuresMiReelles);
  const atterr = colonne(reelMo + budgetMo * (1 - pctMo), reelFo + budgetFo * (1 - pctFo), zoneAtterr, heuresMiAtterr);
  const cols = [prevu, reel, atterr];
  // Détail de la MO par type de personnel : prévu (profils des tâches),
  // réel (pointages SAP) et atterrissage.
  const detailMo = (() => {
    const m = new Map();
    const ligne = (code) => {
      if (!m.has(code)) m.set(code, { code, prevu: 0, reel: 0 });
      return m.get(code);
    };
    (prevuMoLignes || []).forEach((l) => {
      if (l.euro) ligne(l.code).prevu += l.euro;
    });
    parType.forEach((t) => {
      if (t.cout) ligne(t.code).reel += t.cout;
    });
    return [...m.values()]
      .map((t) => ({
        ...t,
        nom: libelleTypeActivite(t.code),
        atterr: t.reel + t.prevu * (1 - pctMo),
      }))
      .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
  })();

  const validerPct = (cle) => {
    if (saisiePct[cle] === undefined) return;
    const t = String(saisiePct[cle]).replace(",", ".").trim();
    const n = t === "" ? null : Number(t);
    setSaisiePct((p) => {
      const { [cle]: _omis, ...reste } = p;
      return reste;
    });
    if (n === null || n >= 0) onChangerPct?.(cle, n === null ? null : n / 100);
  };
  const champPct = (cle) => (
    <input
      type="text"
      inputMode="decimal"
      disabled={!onChangerPct}
      title={typeof pctSaisis?.[cle] === "number" ? "Valeur propre à cette affaire (vider pour revenir au paramètre)" : "Paramètre par défaut — cliquer pour modifier"}
      value={saisiePct[cle] !== undefined ? saisiePct[cle] : String(Math.round(foa[cle] * 100000) / 1000).replace(".", ",")}
      onChange={(e) => setSaisiePct((p) => ({ ...p, [cle]: e.target.value }))}
      onBlur={() => validerPct(cle)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      style={{
        width: "3.4em",
        padding: 0,
        margin: 0,
        height: "auto",
        border: "none",
        borderBottom: "1px dotted currentColor",
        borderRadius: 0,
        background: "transparent",
        boxShadow: "none",
        font: "inherit",
        textAlign: "right",
        color: typeof pctSaisis?.[cle] === "number" ? "var(--accent, inherit)" : "inherit",
      }}
    />
  );

  const validerCa = (champ) => {
    if (saisieCa[champ] === undefined) return;
    const t = String(saisieCa[champ]).replace(",", ".").replace(/\s/g, "").trim();
    const n = t === "" ? null : Number(t);
    setSaisieCa((p) => {
      const { [champ]: _omis, ...reste } = p;
      return reste;
    });
    if (n === null || n >= 0) onChangerCa?.(champ, n);
  };
  const champCa = (champ, valeur) => (
    <input
      type="text"
      inputMode="decimal"
      style={{ width: 150, textAlign: "right" }}
      disabled={!onChangerCa}
      value={
        saisieCa[champ] !== undefined
          ? saisieCa[champ]
          : eur(valeur)
      }
      onFocus={() => setSaisieCa((p) => ({ ...p, [champ]: String(Math.round(valeur * 100) / 100).replace(".", ",") }))}
      onChange={(e) => setSaisieCa((p) => ({ ...p, [champ]: e.target.value }))}
      onBlur={() => validerCa(champ)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header">
        <h2>💶 Bilan financier de l'affaire</h2>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <label>
          CA H.T. (€) {champCa("caHt", ca)}
        </label>
        <span className="simple-list-meta">
          {caSaisi == null
            ? "CA = somme des « PV ligne » de la minute (" + eur(caCalcule) + ")"
            : "CA saisi à la main (minute : " + eur(caCalcule) + ")"}
        </span>
        {caSaisi != null && onChangerCa && (
          <button type="button" className="btn-ghost" onClick={() => onChangerCa("caHt", null)}>
            Revenir au CA de la minute
          </button>
        )}
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Prévu (minute)</th>
              <th>Réel (SAP)</th>
              <th>Atterrissage</th>
            </tr>
          </thead>
          <tbody>
            <Ligne cols={cols} nom="A – Main d'œuvre" champ="a" fort />
{detailMo.map((t) => (
              <LigneVals key={t.code} nom={t.nom} vals={[t.prevu, t.reel, t.atterr]} />
            ))}
            <Ligne
              cols={cols}
              nom={
                <>
                  dont indemnités de zone (J et F){" "}
                  {zone && montantZone ? (
                    <span className="simple-list-meta">
                      {zone} : {eur(montantZone)}/j ÷ 7,2 h
                    </span>
                  ) : (
                    <span style={{ color: ROUGE }}>
                      {zone ? "montant de la zone manquant (Import SAP)" : "zone non renseignée (fiche chantier)"}
                    </span>
                  )}
                </>
              }
              champ="zoneEuro"
              retrait
            />
            <Ligne cols={cols} nom="B – Achats (fournitures et sous-traitance)" champ="b" fort />
            {(detailFo || []).map((t) => (
              <LigneVals
                key={t.libelle}
                nom={t.libelle}
                vals={[t.prevu, t.reel, t.reel + t.prevu * (1 - t.av)]}
              />
            ))}
            <Ligne cols={cols} nom="C – Autres frais" champ="C" fort />
            <Ligne cols={cols} nom={<>Prorata {champPct("prorata")} % du CA</>} champ="C_prorata" retrait />
            <Ligne cols={cols} nom={<>Frais divers {champPct("fraisDivers")} % de la MO</>} champ="C_divers" retrait />
            <Ligne cols={cols} nom={<>Aléas {champPct("aleas")} % du CA</>} champ="C_aleas" retrait />
            <Ligne cols={cols} nom={<>Négociation {champPct("negociation")} % du CA</>} champ="C_nego" retrait />
            <Ligne cols={cols} nom="Matériel interne" champ="C_mi" retrait />
            <Ligne cols={cols} nom={"D – FRA (" + num(foa.fra * 100, 3) + " %)"} champ="D" fort />
            <Ligne cols={cols} nom="Total dépenses affaire" champ="dep" fort style={{ borderTop: "2px solid var(--border, #ccc)" }} />
            <Ligne cols={cols} nom={"Frais généraux (" + num(foa.fg * 100, 2) + " % CA)"} champ="fg" sansReel />
            <Ligne cols={cols} nom="Marge nette" champ="nette" fort sansReel />
            <Ligne cols={cols} nom="k de vente (marge nette ÷ CA)" champ="k" fort sansReel fmt={(v) => num(v * 100, 1) + " %"} />
          </tbody>
        </table>
      </div>
      <p className="simple-list-meta" style={{ margin: "8px 0 16px" }}>
        Calcul repris de la feuille FOA : dépenses = MO + achats + autres frais + FRA ; marge brute = CA − non
        soumis − dépenses ; marge nette = marge brute − frais généraux. Atterrissage = réel + reste à faire au
        budget (budget × (1 − avancement)). Les pourcentages se règlent dans « Import SAP ».
      </p>

      {heuresSansTaux > 0 && (
        <p style={{ color: ROUGE, margin: "8px 0" }}>
          {num(heuresSansTaux)} h pointées sur un type d'activité sans taux ne sont pas valorisées : renseignez
          les taux manquants dans « Import SAP ».
        </p>
      )}

    </div>
  );
}
