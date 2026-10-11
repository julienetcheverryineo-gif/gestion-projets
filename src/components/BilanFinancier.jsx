import { useMemo, useState } from "react";
import { libelleTypeActivite, normaliserTypeActivite, inclutMaterielInterne } from "../lib/typesActiviteSap";
import { HEURES_PAR_JOUR_ZONE } from "../lib/tauxHoraires";
import { analyserCji3 } from "../lib/parseCji3";

const eur = (v) =>
  (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const num = (v, d = 1) =>
  (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const ROUGE = "#c0392b";
// Frais généraux appliqués par l'écran RàE de SAP (constaté sur la marge avant /
// après FG : 15,4 % du CA), au lieu du paramètre FOA (16 %). Ne concerne que
// les tableaux d'aide à la déclaration EAT.
const FG_EAT = 0.154;

// Bilan financier d'une affaire : matériel et main d'œuvre en euros.
// Budget MO = heures chiffrées × taux de chiffrage ; réel MO = heures
// pointées valorisées au taux de leur type d'activité (voir Import SAP).
const classeNeg = (v) => (v < -1e-9 ? { color: ROUGE, fontWeight: 600 } : {});

function Ligne({ cols, classe, tonePos, nom, champ, fort, retrait, sansReel, fmt = eur, style }) {
  return (
    <tr className={classe} style={{ fontWeight: fort ? 700 : undefined, ...style }}>
      <td data-label="" style={retrait ? { paddingLeft: 24 } : undefined}>{nom}</td>
      {cols.map((c, i) => (
        <td key={i} data-label={["Prévu", "Réel (SAP)", "Atterrissage"][i]} style={{ ...(tonePos && c[champ] !== null && c[champ] >= 0 ? { color: "var(--ok)", fontWeight: 700 } : {}), ...classeNeg(c[champ]) }}>
          {sansReel && i === 1 ? "—" : c[champ] === null ? "—" : fmt(c[champ])}
        </td>
      ))}
    </tr>
  );
}

function LigneVals({ nom, vals, classe }) {
  return (
    <tr className={classe}>
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
  margeCibleEat,
  onChangerMargeCibleEat,
  reelSapEat,
  onChangerReelSapEat,
  cji3Eat,
  onChangerCji3Eat,
  engageSapEat,
  onChangerEngageSapEat,
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
  // Marge nette à annoncer : mémorisée sur le chantier (fraction, ex. 0,08).
  const [saisieReelSap, setSaisieReelSap] = useState(null);
  const [messageCji3, setMessageCji3] = useState("");
  const [kCible, setKCible] = useState(null); // saisie en cours (texte), null = valeur enregistrée
  const kAffiche =
    kCible !== null ? kCible : typeof margeCibleEat === "number" ? String(Math.round(margeCibleEat * 100000) / 1000).replace(".", ",") : "";
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
  const colonne = (aBrut, b, zoneEuro, heuresMi, fgTaux = foa.fg) => {
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
    const fg = fgTaux * base;
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
      if (!m.has(code)) m.set(code, { code, prevu: 0, reel: 0, prevuH: 0, reelH: 0 });
      return m.get(code);
    };
    (prevuMoLignes || []).forEach((l) => {
      if (l.euro) ligne(l.code).prevu += l.euro;
      if (l.heures) ligne(l.code).prevuH += l.heures;
    });
    parType.forEach((t) => {
      if (t.cout) ligne(t.code).reel += t.cout;
      if (t.heures && t.code !== "—") ligne(t.code).reelH += t.heures;
    });
    return [...m.values()]
      .map((t) => ({
        ...t,
        nom: libelleTypeActivite(t.code),
        atterr: t.reel + t.prevu * (1 - pctMo),
        atterrH: t.reelH + t.prevuH * (1 - pctMo),
      }))
      .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
  })();


  // ── EAT « pilotée » : on garde le réel et on réduit le reste à faire d'un
  // même facteur f (0 = plus rien de dépensé, 1 = reste à faire intégral).
  // Avec un CJI3 importé : le réel de la MO (heures et €) est le cumul
  // comptabilisé dans SAP, pas les pointages (plus frais que la comptabilité).
  const detailMoE = detailMo.map((t) => {
    const c = cji3Eat?.mo?.[t.code];
    if (!cji3Eat) return { ...t, reelEuro: t.reel };
    const h = c ? c.h : 0;
    const eur = c ? c.eur : 0;
    return { ...t, reelH: h, reelEuro: eur, atterrH: h + t.prevuH * (1 - pctMo), atterr: eur + t.prevu * (1 - pctMo) };
  });
  const reelMoE = cji3Eat ? cji3Eat.moTotal : reelMo;
  const heuresMiReellesE = cji3Eat
    ? detailMoE.filter((t) => inclutMaterielInterne(t.code)).reduce((x, t) => x + t.reelH, 0)
    : heuresMiReelles;
  const foLignes = detailFo || [];
  const reelFoLignes = foLignes.reduce((x, t) => x + t.reel, 0);
  const resteFoLignes = foLignes.reduce((x, t) => x + t.prevu * (1 - t.av), 0);
  // Calage sur le réel SAP : écart entre le réel comptable de l'écran RàE
  // (Cpta Cum + Engagé du « CD hors FRA ») et le réel que l'outil reconstitue
  // (pointages, achats ME2J, matériel interne théorique). Ajouté tel quel au coût.
  const reelOutilDirect = reelMoE + zoneReel + reelFoLignes + heuresMiReellesE * foa.materielInterne;
  const reelSapEffectif = cji3Eat ? cji3Eat.directTotal + (typeof engageSapEat === "number" ? engageSapEat : 0) : typeof reelSapEat === "number" ? reelSapEat : null;
  const calageSap = reelSapEffectif === null ? 0 : reelSapEffectif - reelOutilDirect;
  const eatPourFacteur = (f) => {
    const col = colonne(
      reelMoE + budgetMo * (1 - pctMo) * f,
      reelFoLignes + resteFoLignes * f + calageSap,
      zoneReel + zonePrevu * (1 - pctMo) * f,
      heuresMiReellesE + heuresMatInternePrevues * (1 - pctMo) * f,
      FG_EAT
    );
    return col;
  };
  const heuresMiAtterrE = heuresMiReellesE + heuresMatInternePrevues * (1 - pctMo);
  const prevuEat = colonne(budgetMo, budgetFo, zonePrevu, heuresMatInternePrevues, FG_EAT);
  // Cherche f ∈ [0 ; 1] tel que la marge nette atteigne la cible (en €).
  const resoudreEat = (cibleNette) => {
    if (eatPourFacteur(1).nette >= cibleNette - 0.005) return { f: 1, atteignable: true, col: eatPourFacteur(1) };
    if (eatPourFacteur(0).nette < cibleNette) return { f: 0, atteignable: false, col: eatPourFacteur(0) };
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (eatPourFacteur(mid).nette >= cibleNette) lo = mid; else hi = mid;
    }
    return { f: lo, atteignable: true, col: eatPourFacteur(lo) };
  };

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
      title="Cliquer pour modifier le CA"
      style={{
        width: "8.5em",
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
        color: caSaisi != null ? "var(--accent, inherit)" : "inherit",
      }}
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
        <table className="data-table bf-table">
          <thead>
            <tr>
              <th></th>
              <th>Prévu (minute)</th>
              <th>Réel (SAP)</th>
              <th>Atterrissage</th>
            </tr>
          </thead>
          <tbody>
            <Ligne cols={cols} classe="bf-section bf-mo" nom="A – Main d'œuvre" champ="a" fort />
{detailMo.map((t) => (
              <LigneVals key={t.code} classe="bf-detail bf-mo" nom={t.nom} vals={[t.prevu, t.reel, t.atterr]} />
            ))}
            <Ligne
              cols={cols}
              classe="bf-detail bf-mo"
              nom={
                <>
                  dont indemnités de zone{" "}
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
            <Ligne cols={cols} classe="bf-section bf-ach" nom="B – Achats (fournitures et sous-traitance)" champ="b" fort />
            {(detailFo || []).map((t) => (
              <LigneVals
                key={t.libelle}
                classe="bf-detail bf-ach"
                nom={t.libelle}
                vals={[t.prevu, t.reel, t.reel + t.prevu * (1 - t.av)]}
              />
            ))}
            <Ligne cols={cols} classe="bf-section bf-autres" nom="C – Autres frais" champ="C" fort />
            <Ligne cols={cols} classe="bf-detail bf-autres" nom={<>Prorata {champPct("prorata")} % du CA</>} champ="C_prorata" retrait />
            <Ligne cols={cols} classe="bf-detail bf-autres" nom={<>Frais divers {champPct("fraisDivers")} % de la MO</>} champ="C_divers" retrait />
            <Ligne cols={cols} classe="bf-detail bf-autres" nom={<>Aléas {champPct("aleas")} % du CA</>} champ="C_aleas" retrait />
            <Ligne cols={cols} classe="bf-detail bf-autres" nom={<>Négociation {champPct("negociation")} % du CA</>} champ="C_nego" retrait />
            <Ligne cols={cols} classe="bf-detail bf-autres" nom="Matériel interne" champ="C_mi" retrait />
            <Ligne cols={cols} classe="bf-section bf-fra" nom={"D – FRA (" + num(foa.fra * 100, 3) + " %)"} champ="D" fort />
            <Ligne cols={cols} classe="bf-total" nom="Total dépenses affaire" champ="dep" fort />
            <Ligne cols={cols} classe="bf-fg" nom={"Frais généraux (" + num(foa.fg * 100, 2) + " % CA)"} champ="fg" sansReel />
            <Ligne cols={cols} classe={"bf-resultat" + (atterr.nette < 0 ? " bf-perte" : "")} tonePos nom="Marge nette" champ="nette" fort sansReel />
            <Ligne cols={cols} classe={"bf-resultat" + (atterr.nette < 0 ? " bf-perte" : "")} tonePos nom="k de vente (marge nette ÷ CA)" champ="k" fort sansReel fmt={(v) => num(v * 100, 1) + " %"} />
          </tbody>
        </table>
      </div>
      <p className="simple-list-meta" style={{ margin: "8px 0 16px" }}>
        Atterrissage = réel + reste à faire au budget (budget × (1 − avancement)).
        <br />
        Réglage des taux dans « Import SAP » (commun à toutes les affaires).
      </p>


      <div className="bf-eat" style={{ marginTop: 18 }}>
        <h3 style={{ margin: "0 0 4px" }}>🎯 Aide à la déclaration EAT (estimation à terme)</h3>
        <p className="simple-list-meta" style={{ margin: "0 0 8px" }}>
          EAT réaliste = réel pointé / acheté + reste à faire au budget (budget × (1 − avancement)). FRA, frais généraux,
          prorata, aléas, négociation et matériel interne sont recalculés par la FOA à partir de ces saisies.
          <br />
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label className="btn-ghost" style={{ cursor: onChangerCji3Eat ? "pointer" : "not-allowed" }}>
              ⤓ Importer le CJI3 du chantier
              <input
                type="file"
                accept=".txt,.csv"
                style={{ display: "none" }}
                disabled={!onChangerCji3Eat}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    const texte = new TextDecoder("windows-1252").decode(await f.arrayBuffer());
                    const r = analyserCji3(texte);
                    await onChangerCji3Eat({ ...r, importeLe: new Date().toISOString() });
                    setMessageCji3("CJI3 importé : " + r.nbEcritures + " écritures, réel direct " + eur(r.directTotal));
                  } catch (err) {
                    setMessageCji3(err.message || "Import impossible.");
                  }
                }}
              />
            </label>
            {messageCji3 ? <span>{messageCji3}</span> : cji3Eat?.importeLe ? <span>CJI3 du {new Date(cji3Eat.importeLe).toLocaleDateString("fr-FR")} · réel direct {eur(cji3Eat.directTotal)}</span> : <span>(cumul comptable SAP : heures par type, achats, autres frais)</span>}
          </span>
          <br />
          {cji3Eat ? (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              Engagé SAP (sous-traitance interne, commandes non facturées…) :
              <input
                type="text"
                inputMode="decimal"
                placeholder="ex. 3 673"
                disabled={!onChangerEngageSapEat}
                value={saisieReelSap !== null ? saisieReelSap : typeof engageSapEat === "number" ? String(engageSapEat).replace(".", ",") : ""}
                onChange={(e) => setSaisieReelSap(e.target.value)}
                onBlur={() => {
                  if (saisieReelSap === null) return;
                  const t = String(saisieReelSap).replace(",", ".").replace(/\s/g, "").trim();
                  const n = t === "" ? null : Number(t);
                  setSaisieReelSap(null);
                  if (n === null || (Number.isFinite(n) && n >= 0)) onChangerEngageSapEat?.(n);
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                style={{ width: "7em", textAlign: "right" }}
              />
              € → réel SAP {eur(reelSapEffectif)} · calage {calageSap >= 0 ? "+" : ""}
              {eur(calageSap)} (réel outil : {eur(reelOutilDirect)})
            </span>
          ) : (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            Réel SAP cumulé + engagé (écran RàE, « CD hors FRA ») :
            <input
              type="text"
              inputMode="decimal"
              placeholder="ex. 131 059"
              disabled={!onChangerReelSapEat}
              value={saisieReelSap !== null ? saisieReelSap : typeof reelSapEat === "number" ? String(Math.round(reelSapEat * 100) / 100).replace(".", ",") : ""}
              onChange={(e) => setSaisieReelSap(e.target.value)}
              onBlur={() => {
                if (saisieReelSap === null) return;
                const t = String(saisieReelSap).replace(",", ".").replace(/\s/g, "").trim();
                const n = t === "" ? null : Number(t);
                setSaisieReelSap(null);
                if (n === null || (Number.isFinite(n) && n >= 0)) onChangerReelSapEat?.(n);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              style={{ width: "7em", textAlign: "right" }}
            />
            €
            {typeof reelSapEat === "number" && (
              <span>
                → calage {calageSap >= 0 ? "+" : ""}
                {eur(calageSap)} (réel outil : {eur(reelOutilDirect)})
              </span>
            )}
          </span>
          )}
          <br />
          <em>
            Calage SAP : frais généraux à {num(FG_EAT * 100, 1)} % du CA (valeur de l'écran RàE) au lieu de {num(foa.fg * 100, 1)} % (FOA) pour
            ces trois tableaux ; FRA {num(foa.fra * 100, 3)} %, identique à SAP.
          </em>
        </p>
        <div className="data-table-wrapper">
          <table className="data-table bf-table">
            <thead>
              <tr>
                <th>À déclarer</th>
                <th>Budget (prévu)</th>
                <th>Réel à date</th>
                <th>EAT réaliste</th>
                <th>RAE (reste à déclarer)</th>
                <th>Écart / budget</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bf-section bf-mo"><td colSpan={6}>Main d'œuvre par type (heures)</td></tr>
              {detailMoE.filter((t) => t.prevuH || t.reelH).map((t) => (
                <tr key={t.code} className="bf-detail bf-mo">
                  <td style={{ paddingLeft: 24 }}>{t.nom}</td>
                  <td>{num(t.prevuH)} h</td>
                  <td>{num(t.reelH)} h</td>
                  <td style={{ fontWeight: 700 }}>{num(t.atterrH)} h <span className="simple-list-meta">({eur(t.atterr)})</span></td>
                  <td>{num(t.atterrH - t.reelH)} h</td>
                  <td style={classeNeg(t.prevuH - t.atterrH)}>{(t.atterrH - t.prevuH > 0 ? "+" : "") + num(t.atterrH - t.prevuH)} h</td>
                </tr>
              ))}
              <tr className="bf-section bf-ach"><td colSpan={6}>Fournitures / sous-traitance par type (€)</td></tr>
              {(detailFo || []).map((t) => {
                const e = t.reel + t.prevu * (1 - t.av);
                return (
                  <tr key={t.libelle} className="bf-detail bf-ach">
                    <td style={{ paddingLeft: 24 }}>{t.libelle}</td>
                    <td>{eur(t.prevu)}</td>
                    <td>{eur(t.reel)}</td>
                    <td style={{ fontWeight: 700 }}>{eur(e)}</td>
                    <td>{eur(e - t.reel)}</td>
                    <td style={classeNeg(t.prevu - e)}>{(e - t.prevu > 0 ? "+" : "") + eur(e - t.prevu)}</td>
                  </tr>
                );
              })}
              <tr className="bf-section bf-autres"><td colSpan={6}>Autres frais (€)</td></tr>
              <tr className="bf-detail bf-autres">
                <td style={{ paddingLeft: 24 }}>Autres frais <span className="simple-list-meta">({num(foa.materielInterne, 2)} €/h sur les heures porteuses)</span></td>
                <td>{eur(prevu.C_mi)}</td>
                <td>{eur(heuresMiReellesE * foa.materielInterne)}</td>
                <td style={{ fontWeight: 700 }}>{eur(heuresMiAtterrE * foa.materielInterne)}</td>
                <td>{eur((heuresMiAtterrE - heuresMiReellesE) * foa.materielInterne)}</td>
                <td style={classeNeg(prevu.C_mi - heuresMiAtterrE * foa.materielInterne)}>{(heuresMiAtterrE * foa.materielInterne - prevu.C_mi > 0 ? "+" : "") + eur(heuresMiAtterrE * foa.materielInterne - prevu.C_mi)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {(() => {
          const atterrEat = eatPourFacteur(1);
          const ecart = atterrEat.nette - prevuEat.nette;
          const kPrevu = prevuEat.k, kAtt = atterrEat.k;
          // Surcoût direct (avant FRA et frais divers) à absorber pour revenir à la marge annoncée.
          const coefMarge = 1 + foa.fra;
          const aAbsorber = ecart < 0 ? -ecart / coefMarge : 0;
          return (
            <div className="bf-eat-synthese" style={{ marginTop: 10, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8 }}>
              <div>
                Marge annoncée (prévu) : <strong>{eur(prevuEat.nette)}</strong> · k {kPrevu === null ? "—" : num(kPrevu * 100, 1) + " %"}
              </div>
              <div>
                Marge avec EAT réaliste : <strong style={classeNeg(atterrEat.nette)}>{eur(atterrEat.nette)}</strong> · k {kAtt === null ? "—" : num(kAtt * 100, 1) + " %"}
                {" "}
                <span style={ecart < 0 ? { color: ROUGE, fontWeight: 600 } : { color: "var(--ok)", fontWeight: 600 }}>
                  ({(ecart > 0 ? "+" : "") + eur(ecart)})
                </span>
              </div>
              {ecart < -1 ? (
                <div className="simple-list-meta" style={{ marginTop: 4 }}>
                  Déclarer l'EAT réaliste dégrade la marge de {eur(-ecart)}. Pour la tenir, il faudrait trouver environ{" "}
                  {eur(aAbsorber)} d'économies directes (MO / FO) sur le reste à faire — à partir des lignes en dépassement
                  ci-dessus — ou obtenir du CA supplémentaire (avenant). Le budget prévu ne peut pas être déclaré en dessous du réel déjà dépensé.
                </div>
              ) : (
                <div className="simple-list-meta" style={{ marginTop: 4 }}>
                  L'EAT réaliste ne dégrade pas la marge annoncée : vous pouvez le déclarer tel quel.
                </div>
              )}
            </div>
          );
        })()}
      </div>


      {(() => {
        const tableauEat = (titre, explication, res, cible) => (
          <div className="bf-eat" style={{ marginTop: 18 }}>
            <h3 style={{ margin: "0 0 4px" }}>{titre}</h3>
            <p className="simple-list-meta" style={{ margin: "0 0 8px" }}>{explication}</p>
            <div className="data-table-wrapper">
              <table className="data-table bf-table">
                <thead>
                  <tr>
                    <th>À déclarer</th>
                    <th>Réel à date</th>
                    <th>EAT réaliste</th>
                    <th>EAT à déclarer</th>
                    <th>RAE (reste à déclarer)</th>
                    <th>Écart / réaliste</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bf-section bf-mo"><td colSpan={6}>Main d'œuvre par type (heures)</td></tr>
                  {detailMoE.filter((t) => t.prevuH || t.reelH).map((t) => {
                    const h = t.reelH + t.prevuH * (1 - pctMo) * res.f;
                    return (
                      <tr key={t.code} className="bf-detail bf-mo">
                        <td style={{ paddingLeft: 24 }}>{t.nom}</td>
                        <td>{num(t.reelH)} h</td>
                        <td>{num(t.atterrH)} h</td>
                        <td style={{ fontWeight: 700 }}>{num(h)} h</td>
                        <td>{num(h - t.reelH)} h</td>
                        <td>{num(h - t.atterrH)} h</td>
                      </tr>
                    );
                  })}
                  <tr className="bf-section bf-ach"><td colSpan={6}>Fournitures / sous-traitance par type (€)</td></tr>
                  {foLignes.map((t) => {
                    const r = t.reel + t.prevu * (1 - t.av);
                    const e = t.reel + t.prevu * (1 - t.av) * res.f;
                    return (
                      <tr key={t.libelle} className="bf-detail bf-ach">
                        <td style={{ paddingLeft: 24 }}>{t.libelle}</td>
                        <td>{eur(t.reel)}</td>
                        <td>{eur(r)}</td>
                        <td style={{ fontWeight: 700 }}>{eur(e)}</td>
                        <td>{eur(e - t.reel)}</td>
                        <td>{eur(e - r)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bf-section bf-autres"><td colSpan={6}>Autres frais (€)</td></tr>
                  <tr className="bf-detail bf-autres">
                    <td style={{ paddingLeft: 24 }}>Autres frais</td>
                    <td>{eur(heuresMiReellesE * foa.materielInterne)}</td>
                    <td>{eur(heuresMiAtterrE * foa.materielInterne)}</td>
                    <td style={{ fontWeight: 700 }}>{eur((heuresMiReellesE + heuresMatInternePrevues * (1 - pctMo) * res.f) * foa.materielInterne)}</td>
                    <td>{eur(heuresMatInternePrevues * (1 - pctMo) * res.f * foa.materielInterne)}</td>
                    <td>{eur((heuresMiReellesE + heuresMatInternePrevues * (1 - pctMo) * res.f - heuresMiAtterrE) * foa.materielInterne)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8 }}>
              <div>
                Marge nette obtenue : <strong style={classeNeg(res.col.nette)}>{eur(res.col.nette)}</strong> · k{" "}
                {res.col.k === null ? "—" : num(res.col.k * 100, 1) + " %"}
                {cible !== null && <span className="simple-list-meta"> (cible : {eur(cible)})</span>}
              </div>
              {!res.atteignable ? (
                <div style={{ color: ROUGE, marginTop: 4 }}>
                  Objectif inatteignable : même sans aucune dépense supplémentaire, la marge maximale est de {eur(res.col.nette)}
                  {res.col.k === null ? "" : " (" + num(res.col.k * 100, 1) + " %)"}. Il faudrait du CA en plus (avenant) ou revoir les paramètres FOA.
                </div>
              ) : res.f >= 0.9999 ? (
                <div className="simple-list-meta" style={{ marginTop: 4 }}>L'EAT réaliste suffit à atteindre cette marge : déclarez-le tel quel.</div>
              ) : (
                <div className="simple-list-meta" style={{ marginTop: 4 }}>
                  Cela suppose de ne dépenser que {num(res.f * 100, 1)} % du reste à faire au budget, sur toutes les lignes
                  (réel déjà dépensé conservé). À défendre : chaque réduction doit correspondre à une économie réellement attendue.
                </div>
              )}
            </div>
          </div>
        );
        const resAnnonce = resoudreEat(prevuEat.nette);
        const kSaisi = (() => {
          const t = String(kAffiche).replace(",", ".").replace("%", "").trim();
          const n = t === "" ? null : Number(t);
          return n !== null && Number.isFinite(n) ? n / 100 : null;
        })();
        const resCible = kSaisi !== null ? resoudreEat(kSaisi * base) : null;
        return (
          <>
            {tableauEat(
              "🛡️ EAT à déclarer pour tenir la marge annoncée",
              "Même marge nette que le prévu (" + eur(prevuEat.nette) + ", k " + (prevuEat.k === null ? "—" : num(prevuEat.k * 100, 1) + " %") + ") : l'outil calcule la part du reste à faire à ne pas dépasser, ligne par ligne, avec le FRA, les frais généraux et le matériel interne recalculés.",
              resAnnonce,
              prevuEat.nette
            )}
            <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>🎚️ Je veux annoncer</h3>
              <input
                type="text"
                inputMode="decimal"
                placeholder={prevuEat.k === null ? "ex. 8" : num(prevuEat.k * 100, 1)}
                value={kAffiche}
                disabled={!onChangerMargeCibleEat}
                onChange={(e) => setKCible(e.target.value)}
                onBlur={() => {
                  if (kCible === null) return;
                  const t = String(kCible).replace(",", ".").replace("%", "").trim();
                  const n = t === "" ? null : Number(t);
                  setKCible(null);
                  if (n === null || (Number.isFinite(n) && n > -100 && n < 100)) onChangerMargeCibleEat?.(n === null ? null : n / 100);
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                style={{ width: "5em", textAlign: "right" }}
              />
              <span>% de marge nette (k de vente)</span>
              {typeof margeCibleEat === "number" && <span className="simple-list-meta">enregistré pour ce chantier</span>}
            </div>
            {resCible
              ? tableauEat(
                  "🎯 EAT à déclarer pour " + num(kSaisi * 100, 1) + " % de marge nette",
                  "Marge nette cible : " + eur(kSaisi * base) + " sur un CA de " + eur(base) + ".",
                  resCible,
                  kSaisi * base
                )
              : <p className="simple-list-meta" style={{ marginTop: 6 }}>Saisissez un pourcentage pour obtenir les valeurs à déclarer.</p>}
          </>
        );
      })()}


      {cji3Eat && (() => {
        const lignes = cji3Eat.ecritures || [];
        const groupes = [
          ["Achats (classe 60)", (e) => /^60/.test(e.nat)],
          ["Autres frais (62, 64, 9000)", (e) => /^(62|64|9000)/.test(e.nat)],
          ["FRA (941)", (e) => /^941/.test(e.nat)],
          ["Produits / facturé (70)", (e) => /^70/.test(e.nat)],
        ];
        const parCompte = (liste) => {
          const m = new Map();
          liste.forEach((e) => {
            const k = e.nat + "|" + e.designation;
            if (!m.has(k)) m.set(k, { nat: e.nat, designation: e.designation, nb: 0, montant: 0 });
            const g = m.get(k);
            g.nb++;
            g.montant += e.montant;
          });
          return [...m.values()].sort((a, b) => a.nat.localeCompare(b.nat));
        };
        const sansCommande = lignes.filter((e) => /^60/.test(e.nat) && (!e.docAchat || !/facture mm/i.test(e.typePiece || "")));
        const totalSansCommande = sansCommande.reduce((x, e) => x + e.montant, 0);
        return (
          <div className="bf-eat" style={{ marginTop: 18 }}>
            <h3 style={{ margin: "0 0 4px" }}>🧾 Bilan autres frais — comptabilité SAP (CJI3 du {cji3Eat.importeLe ? new Date(cji3Eat.importeLe).toLocaleDateString("fr-FR") : "—"})</h3>
            <p className="simple-list-meta" style={{ margin: "0 0 8px" }}>
              Tout ce que SAP a comptabilisé hors main d'œuvre, par compte. Sert à caler l'EAT sur le réel comptable ; mise en page à retravailler.
            </p>
            <div className="data-table-wrapper">
              <table className="data-table bf-table">
                <thead>
                  <tr>
                    <th>Compte</th>
                    <th>Désignation</th>
                    <th>Écritures</th>
                    <th>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {groupes.map(([titre, test]) => {
                    const liste = lignes.filter(test);
                    if (liste.length === 0) return null;
                    const total = liste.reduce((x, e) => x + e.montant, 0);
                    return [
                      <tr key={titre} className="bf-section bf-autres">
                        <td colSpan={3}>{titre}</td>
                        <td style={classeNeg(-total)}>{eur(total)}</td>
                      </tr>,
                      ...parCompte(liste).map((g) => (
                        <tr key={titre + g.nat + g.designation} className="bf-detail bf-autres">
                          <td style={{ paddingLeft: 24 }}>{g.nat}</td>
                          <td>{g.designation}</td>
                          <td>{g.nb}</td>
                          <td>{eur(g.montant)}</td>
                        </tr>
                      )),
                    ];
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8 }}>
              <div>
                Achats comptabilisés : <strong>{eur(cji3Eat.achats)}</strong> · achats ME2J de l'outil : <strong>{eur(reelFoLignes)}</strong> · écart{" "}
                <strong>{eur(cji3Eat.achats - reelFoLignes)}</strong>
              </div>
              {sansCommande.length > 0 && (
                <div className="simple-list-meta" style={{ marginTop: 4 }}>
                  Écritures achats sans commande d'achat (hors ME2J) : {eur(totalSansCommande)} —{" "}
                  {sansCommande.map((e) => `${e.date} ${e.typePiece || "pièce"} ${e.texte || ""} ${eur(e.montant)}`).join(" ; ")}
                </div>
              )}
              <div style={{ marginTop: 4 }}>
                Autres frais comptabilisés : <strong>{eur(cji3Eat.autresFrais)}</strong> · matériel interne théorique de l'outil :{" "}
                <strong>{eur(heuresMiReellesE * foa.materielInterne)}</strong>
              </div>
              <div style={{ marginTop: 4 }}>
                FRA comptabilisé : <strong>{eur(cji3Eat.fra)}</strong> · facturé comptabilisé : <strong>{eur(-cji3Eat.produits)}</strong>
              </div>
            </div>
          </div>
        );
      })()}

      {heuresSansTaux > 0 && (
        <p style={{ color: ROUGE, margin: "8px 0" }}>
          {num(heuresSansTaux)} h pointées sur un type d'activité sans taux ne sont pas valorisées : renseignez
          les taux manquants dans « Import SAP ».
        </p>
      )}

    </div>
  );
}
