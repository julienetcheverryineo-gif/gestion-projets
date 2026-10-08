import { useMemo, useState } from "react";
import { libelleTypeActivite, normaliserTypeActivite } from "../lib/typesActiviteSap";

const eur = (v) =>
  (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const num = (v, d = 1) =>
  (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v) => num((Number(v) || 0) * 100, 0) + " %";
const ROUGE = "#c0392b";

// Bilan financier d'une affaire : matériel et main d'œuvre en euros.
// Budget MO = heures chiffrées × taux de chiffrage ; réel MO = heures
// pointées valorisées au taux de leur type d'activité (voir Import SAP).
export default function BilanFinancier({
  budgetFo,
  pctFo,
  budgetHeures,
  pctMo,
  achats,
  heures,
  taux,
  tauxChiffrage,
  tauxChiffrageDefaut,
  onTauxChiffrage,
}) {
  const [saisie, setSaisie] = useState(null);

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

  const heuresPointees = parType.reduce((s, t) => s + t.heures, 0);
  const heuresSansTaux = parType.filter((t) => t.taux === null).reduce((s, t) => s + t.heures, 0);
  const reelMo = parType.reduce((s, t) => s + (t.cout || 0), 0);

  const tx = tauxChiffrage ?? tauxChiffrageDefaut ?? 0;
  const budgetMo = budgetHeures * tx;
  const heuresEquiv = tx > 0 ? reelMo / tx : null;

  const atterrissage = (budget, reel, avancement) => reel + budget * (1 - avancement);
  const lignes = [
    { nom: "📦 Fournitures", budget: budgetFo, reel: reelFo, av: pctFo },
    { nom: "👷 Main d'œuvre", budget: budgetMo, reel: reelMo, av: pctMo },
  ].map((l) => ({ ...l, atterr: atterrissage(l.budget, l.reel, l.av) }));
  const total = lignes.reduce(
    (t, l) => ({ budget: t.budget + l.budget, reel: t.reel + l.reel, atterr: t.atterr + l.atterr }),
    { budget: 0, reel: 0, atterr: 0 }
  );
  const classeEcart = (v) => (v < -0.005 ? { color: ROUGE, fontWeight: 600 } : {});

  const validerTaux = () => {
    if (saisie === null) return;
    const t = String(saisie).replace(",", ".").trim();
    const n = t === "" ? null : Number(t);
    if (n === null || n >= 0) onTauxChiffrage?.(n);
    setSaisie(null);
  };

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header">
        <h2>💶 Bilan financier de l'affaire</h2>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Budget</th>
              <th>Réel (SAP)</th>
              <th>Avancement</th>
              <th>Atterrissage estimé</th>
              <th>Écart prévisionnel</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.nom}>
                <td data-label="">{l.nom}</td>
                <td data-label="Budget">{eur(l.budget)}</td>
                <td data-label="Réel (SAP)">{eur(l.reel)}</td>
                <td data-label="Avancement">{pct(l.av)}</td>
                <td data-label="Atterrissage estimé">{eur(l.atterr)}</td>
                <td data-label="Écart prévisionnel" style={classeEcart(l.budget - l.atterr)}>
                  {eur(l.budget - l.atterr)}
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td data-label="">Total affaire</td>
              <td data-label="Budget">{eur(total.budget)}</td>
              <td data-label="Réel (SAP)">{eur(total.reel)}</td>
              <td data-label="Avancement">{total.budget > 0 ? pct((total.budget - (total.atterr - total.reel)) / total.budget) : "—"}</td>
              <td data-label="Atterrissage estimé">{eur(total.atterr)}</td>
              <td data-label="Écart prévisionnel" style={classeEcart(total.budget - total.atterr)}>
                {eur(total.budget - total.atterr)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="simple-list-meta" style={{ margin: "8px 0 16px" }}>
        Atterrissage estimé = réel + reste à faire valorisé au budget (budget × (1 − avancement)). Écart
        prévisionnel négatif (rouge) = dépassement attendu.
      </p>

      <h3 style={{ margin: "0 0 8px" }}>Main d'œuvre : heures et euros</h3>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <label>
          Taux de chiffrage (€/h){" "}
          <input
            type="text"
            inputMode="decimal"
            style={{ width: 90 }}
            disabled={!onTauxChiffrage}
            value={saisie !== null ? saisie : String(tx).replace(".", ",")}
            onChange={(e) => setSaisie(e.target.value)}
            onBlur={validerTaux}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
        <span className="simple-list-meta">
          {tauxChiffrage == null ? "par défaut (type I205)" : "propre à cette affaire"}
        </span>
      </div>
      <div className="data-table-wrapper">
        <table className="data-table">
          <tbody>
            <tr>
              <td>Heures chiffrées</td>
              <td>{num(budgetHeures)} h</td>
            </tr>
            <tr>
              <td>Heures pointées</td>
              <td>{num(heuresPointees)} h</td>
            </tr>
            <tr>
              <td>Heures équivalentes chiffrées (réel € ÷ taux de chiffrage)</td>
              <td>{heuresEquiv === null ? "—" : num(heuresEquiv) + " h"}</td>
            </tr>
            <tr>
              <td>Taux moyen réel</td>
              <td>{heuresPointees - heuresSansTaux > 0 ? eur(reelMo / (heuresPointees - heuresSansTaux)) + " /h" : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {heuresSansTaux > 0 && (
        <p style={{ color: ROUGE, margin: "8px 0" }}>
          {num(heuresSansTaux)} h pointées sur un type d'activité sans taux ne sont pas valorisées : renseignez
          les taux manquants dans « Import SAP ».
        </p>
      )}

      <h3 style={{ margin: "16px 0 8px" }}>Heures pointées par type d'activité</h3>
      {parType.length === 0 ? (
        <p className="simple-list-meta">Aucun pointage SAP pour ce chantier.</p>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type d'activité</th>
                <th>Heures</th>
                <th>Taux (€/h)</th>
                <th>Coût</th>
              </tr>
            </thead>
            <tbody>
              {parType.map((t) => (
                <tr key={t.code}>
                  <td data-label="Type d'activité">{libelleTypeActivite(t.code)}</td>
                  <td data-label="Heures">{num(t.heures)} h</td>
                  <td data-label="Taux (€/h)" style={t.taux === null ? { color: ROUGE } : {}}>
                    {t.taux === null ? "manquant" : eur(t.taux)}
                  </td>
                  <td data-label="Coût">{t.cout === null ? "—" : eur(t.cout)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
