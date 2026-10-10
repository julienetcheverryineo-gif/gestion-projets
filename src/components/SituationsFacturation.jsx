import { useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { construireLignesSituation, montantADeduire, montantAvancement, montantMarche, pctCumule, totalCumule, TVA_DEFAUT } from "../lib/situations";
import { genererFichierSituation } from "../lib/exportSituation";

const euro = (n) => Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const aujourdhui = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const pctTexte = (v) => String(Math.round((Number(v) || 0) * 100) / 100).replace(".", ",");
const CLE_ENSEMBLE = "_all";

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Onglet « Situations » d'un chantier : saisie de l'avancement CUMULÉ (%) par
// ligne de la minute (prix de vente de la minute), puis export Excel.
// Stockage : chantier.situationsMode ("ensemble" | "devis") et
// chantier.situationsData = { "_all" | <devisId>: [situations] }.
export default function SituationsFacturation({ chantierId, chantier, devis, toutesLignes, tousGroupes, peutGerer }) {
  const { profile } = useAuth();
  const mode = chantier?.situationsMode || null; // null = pas encore choisi
  const [devisChoisi, setDevisChoisi] = useState(null);
  const devisActif = mode === "devis" ? devis.find((d) => d.id === devisChoisi) ?? devis[0] ?? null : null;
  const cleDonnees = mode === "devis" ? devisActif?.id : CLE_ENSEMBLE;
  const situations = useMemo(() => chantier?.situationsData?.[cleDonnees] || [], [chantier?.situationsData, cleDonnees]);
  const devisConcernes = mode === "devis" ? (devisActif ? [devisActif] : []) : devis;
  const rows = useMemo(
    () => construireLignesSituation(devisConcernes, toutesLignes, chantierId, tousGroupes || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devis, devisActif?.id, mode, toutesLignes, chantierId, tousGroupes]
  );
  const [choixIndex, setChoixIndex] = useState(null);
  const indexOuvert = situations.length === 0 ? -1 : Math.min(choixIndex ?? situations.length - 1, situations.length - 1);
  const [saisies, setSaisies] = useState({});
  const [export_, setExport] = useState(null);
  const tauxTva = chantier?.tauxTvaSituation ?? TVA_DEFAUT;
  const acompte = Number(chantier?.acompteData?.[cleDonnees]) || 0;
  const enregistrerAcompte = (txt) => {
    const n = Number(String(txt).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n === acompte) return;
    return updateDoc(doc(db, "sites", chantierId), { acompteData: { ...(chantier?.acompteData || {}), [cleDonnees]: n } });
  };

  const marche = montantMarche(rows);
  const sit = indexOuvert >= 0 ? situations[indexOuvert] : null;
  const estDerniere = indexOuvert === situations.length - 1;
  const modifiable = peutGerer && estDerniere;

  const enregistrer = (nouvelles, extra = {}) =>
    updateDoc(doc(db, "sites", chantierId), {
      situationsData: { ...(chantier?.situationsData || {}), [cleDonnees]: nouvelles },
      ...extra,
    });

  const choisirMode = (m) => updateDoc(doc(db, "sites", chantierId), { situationsMode: m });

  const nouvelleSituation = async () => {
    const precedente = situations[situations.length - 1];
    const s = {
      numero: (precedente?.numero ?? 0) + 1,
      date: aujourdhui(),
      auteur: [profile?.prenom, profile?.nom].filter(Boolean).join(" ") || profile?.nom || "",
      avancements: { ...(precedente?.avancements || {}) },
    };
    await enregistrer([...situations, s]);
    setChoixIndex(situations.length);
  };

  const supprimerDerniere = async () => {
    if (!estDerniere || !window.confirm("Supprimer la situation " + sit.numero + " ?")) return;
    await enregistrer(situations.slice(0, -1));
    setChoixIndex(null);
  };

  const majSituation = (patch) => enregistrer(situations.map((s, i) => (i === indexOuvert ? { ...s, ...patch } : s)));

  const fixerPct = (ligneIds, valeur) => {
    const av = { ...sit.avancements };
    ligneIds.forEach((id) => {
      av[id] = valeur;
    });
    return majSituation({ avancements: av });
  };

  const valider = (ligneIds, cle) => {
    const brut = saisies[cle];
    if (brut === undefined) return;
    setSaisies((p) => {
      const { [cle]: _o, ...reste } = p;
      return reste;
    });
    const t = String(brut).replace(",", ".").replace("%", "").trim();
    if (t === "") return;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 100) return;
    fixerPct(ligneIds, n);
  };

  const champ = (cle, ligneIds, valeurAffichee) => (
    <input
      type="text"
      inputMode="decimal"
      disabled={!modifiable}
      value={saisies[cle] !== undefined ? saisies[cle] : valeurAffichee}
      onChange={(e) => setSaisies((p) => ({ ...p, [cle]: e.target.value }))}
      onBlur={() => valider(ligneIds, cle)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="sit-pct"
    />
  );

  const exporter = async () => {
    setExport({ phase: "attente" });
    try {
      const nomChantier = chantier?.nom + (devisActif ? " - " + devisActif.nom : "");
      const blob = await genererFichierSituation({
        chantier: { ...chantier, nom: nomChantier },
        rows,
        situations,
        indexSituation: indexOuvert,
        tauxTva,
        acompte,
      });
      const nom = `Situation ${sit.numero} - ${(nomChantier || "chantier").replace(/[\\/:*?"<>|]+/g, " ").trim()}.xlsx`;
      telecharger(blob, nom);
      setExport({ phase: "ok" });
    } catch (e) {
      setExport({ phase: "erreur", message: e.message });
    }
  };

  const chapitres = [];
  rows.forEach((r) => {
    if (r.type === "chapitre" || chapitres.length === 0) chapitres.push({ titre: r.type === "chapitre" ? r : null, items: [] });
    if (r.type !== "chapitre") chapitres[chapitres.length - 1].items.push(r);
  });

  const cumulHt = sit ? totalCumule(rows, situations, indexOuvert) : 0;
  const precedentHt = sit ? montantADeduire(rows, situations, indexOuvert, acompte) : 0;
  const moisHt = Math.round((cumulHt - precedentHt) * 100) / 100;
  const tva = Math.round(moisHt * (tauxTva / 100) * 100) / 100;

  // Première situation : choix du périmètre (ensemble de l'affaire ou par devis).
  if (!mode && devis.length > 1 && peutGerer) {
    return (
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h2>Situations de travaux</h2>
        </div>
        <p style={{ marginBottom: 12 }}>
          Ce chantier compte {devis.length} devis. Les situations de facturation se font…
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={() => choisirMode("ensemble")}>
            Pour l'ensemble de l'affaire
          </button>
          <button className="btn-ghost" onClick={() => choisirMode("devis")}>
            Par devis
          </button>
        </div>
        <p className="simple-list-meta" style={{ marginTop: 10 }}>
          Ensemble : une seule numérotation, tous les devis dans le même fichier. Par devis : une série de situations
          (et un fichier) par devis. Ce choix s'applique à toutes les situations du chantier.
        </p>
      </div>
    );
  }
  const lignesFact = rows.filter((r) => r.type === "ligne");
  const cumulPrec = indexOuvert > 0 ? totalCumule(rows, situations, indexOuvert - 1) : 0;
  const travauxPeriode = Math.round((cumulHt - cumulPrec) * 100) / 100;
  const pctGlobal = marche > 0 ? (cumulHt / marche) * 100 : 0;

  return (
    <div className="sit">
      <div className="sit-top">
        <div>
          <h2 className="sit-titre">Situations de travaux{mode === "devis" ? " · par devis" : ""}</h2>
          <div className="simple-list-meta">
            {mode === "devis" ? "Devis" : "Marché"} : <strong>{euro(marche)} € HT</strong>
          </div>
        </div>
        {peutGerer && devis.length > 1 && (
          <button
            type="button"
            className="btn-ghost"
            title="Les situations déjà saisies dans l'autre mode sont conservées et réapparaissent si vous revenez"
            onClick={() => {
              const cible = mode === "devis" ? "ensemble" : "devis";
              const msg =
                "Passer en mode « " + (cible === "devis" ? "par devis" : "ensemble de l'affaire") + " » ?\n\nLes situations du mode actuel ne sont pas supprimées : elles sont simplement masquées et réapparaissent si vous revenez dans ce mode.";
              if (window.confirm(msg)) choisirMode(cible);
            }}
          >
            ⇄ {mode === "devis" ? "Passer à l'ensemble de l'affaire" : "Passer en mode par devis"}
          </button>
        )}
        {mode === "devis" && (
          <div className="sit-chips">
            {devis.map((d) => (
              <button
                key={d.id}
                className={"sit-chip" + (d.id === devisActif?.id ? " actif" : "")}
                onClick={() => {
                  setDevisChoisi(d.id);
                  setChoixIndex(null);
                }}
              >
                {d.nom}
              </button>
            ))}
          </div>
        )}
      </div>

      {lignesFact.length === 0 ? (
        <p className="simple-list-meta">
          Aucune ligne facturable : importez ou mettez à jour la minute du devis (colonne « PV ligne »).
        </p>
      ) : (
        <>
          <div className="sit-chips" style={{ marginBottom: 14 }}>
            {situations.map((s, i) => (
              <button key={i} className={"sit-chip" + (i === indexOuvert ? " actif" : "")} onClick={() => setChoixIndex(i)}>
                Situation {s.numero}
              </button>
            ))}
            {peutGerer && (
              <button className="sit-chip sit-chip-ajout" onClick={nouvelleSituation}>
                + Nouvelle situation
              </button>
            )}
          </div>

          {sit ? (
            <>
              <div className="sit-kpis">
                <div className="sit-kpi">
                  <span>Avancement cumulé</span>
                  <strong>{euro(cumulHt)} €</strong>
                  <div className="sit-barre">
                    <i style={{ width: Math.min(100, pctGlobal) + "%" }} />
                  </div>
                  <em>{pctTexte(pctGlobal)} % du marché</em>
                </div>
                <div className="sit-kpi">
                  <span>{indexOuvert === 0 && acompte ? "Acompte à déduire" : "Déjà facturé"}</span>
                  <strong>− {euro(precedentHt)} €</strong>
                  <em>HT</em>
                </div>
                <div className="sit-kpi sit-kpi-fort">
                  <span>Montant du mois</span>
                  <strong>{euro(moisHt)} €</strong>
                  <em>HT · travaux de la période {euro(travauxPeriode)} €</em>
                </div>
                <div className="sit-kpi">
                  <span>TTC (TVA {String(tauxTva).replace(".", ",")} %)</span>
                  <strong>{euro(moisHt + tva)} €</strong>
                  <em>TVA {euro(tva)} €</em>
                </div>
              </div>

              <div className="sit-barre-outils">
                <label>
                  Date
                  <input type="date" disabled={!modifiable} value={sit.date || ""} onChange={(e) => majSituation({ date: e.target.value })} />
                </label>
                <label>
                  Établie par
                  <input style={{ width: 190 }} disabled={!modifiable} value={sit.auteur || ""} onChange={(e) => majSituation({ auteur: e.target.value })} />
                </label>
                <label title="Facture d'acompte déjà émise (HT), à saisir une seule fois : elle est déduite de la première situation">
                  Acompte HT déjà facturé
                  <input
                    key={"ac" + acompte}
                    style={{ width: 120, textAlign: "right" }}
                    inputMode="decimal"
                    disabled={!peutGerer}
                    defaultValue={acompte ? euro(acompte) : ""}
                    placeholder="0,00"
                    onBlur={(e) => enregistrerAcompte(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </label>
                <label>
                  TVA (%)
                  <input
                    style={{ width: 60 }}
                    inputMode="decimal"
                    disabled={!peutGerer}
                    defaultValue={String(tauxTva).replace(".", ",")}
                    onBlur={(e) => {
                      const n = Number(String(e.target.value).replace(",", "."));
                      if (Number.isFinite(n) && n >= 0 && n !== tauxTva) updateDoc(doc(db, "sites", chantierId), { tauxTvaSituation: n });
                    }}
                  />
                </label>
                <span className="sit-actions">
                  {modifiable && (
                    <button type="button" className="btn-ghost btn-danger" onClick={supprimerDerniere}>
                      Supprimer
                    </button>
                  )}
                  <button type="button" className="btn-primary" disabled={export_?.phase === "attente"} onClick={exporter}>
                    {export_?.phase === "attente" ? "Génération…" : "⬇ Exporter la situation " + sit.numero}
                  </button>
                </span>
              </div>
              {!estDerniere && (
                <p className="simple-list-meta" style={{ marginBottom: 8 }}>
                  Situation passée : consultation et export uniquement (seule la dernière situation est modifiable).
                </p>
              )}
              {export_?.phase === "erreur" && <div className="form-error">⚠ {export_.message}</div>}

              <div className="sit-entete-colonnes">
                <span>Description</span>
                <span>Total HT</span>
                <span>Précédent</span>
                <span>% cumulé</span>
                <span>Période</span>
              </div>

              {chapitres.map((ch, ci) => {
                const ids = ch.items.filter((r) => r.type === "ligne").map((r) => r.id);
                const totalCh = ch.items.filter((r) => r.type === "ligne").reduce((t, r) => t + r.total, 0);
                const cumulCh = ch.items
                  .filter((r) => r.type === "ligne")
                  .reduce((t, r) => t + montantAvancement(r, pctCumule(situations, indexOuvert, r.id)), 0);
                const pctCh = totalCh > 0 ? (cumulCh / totalCh) * 100 : 0;
                return (
                  <section key={"c" + ci} className="sit-chap">
                    {ch.titre && (
                      <header className="sit-chap-tete">
                        <div className="sit-chap-nom">{ch.titre.texte}</div>
                        <div className="sit-chap-prog">
                          <div className="sit-barre">
                            <i style={{ width: Math.min(100, pctCh) + "%" }} />
                          </div>
                          <span>
                            {pctTexte(pctCh)} % · {euro(cumulCh)} / {euro(totalCh)} €
                          </span>
                        </div>
                        {ids.length > 0 && modifiable && (
                          <label className="sit-chap-tout" title="Applique ce % cumulé à toutes les lignes du chapitre">
                            Tout le chapitre {champ("ch" + ci, ids, "")}
                          </label>
                        )}
                      </header>
                    )}
                    {ch.items.map((r) =>
                      r.type === "titre" ? (
                        <div key={r.id} className="sit-sous-titre">
                          {r.texte}
                        </div>
                      ) : (
                        <div key={r.id} className="sit-ligne">
                          <div className="sit-desc" title={r.texte}>
                            {r.texte.split("\n")[0]}
                            <small>
                              {r.quantite} {r.unite} × {euro(r.pu)} €
                              {r.compensation ? " · dont compensation " + euro(r.compensation) + " €" : ""}
                            </small>
                          </div>
                          <div className="sit-num">{euro(r.total)}</div>
                          <div className="sit-num sit-muet">{pctTexte(indexOuvert > 0 ? pctCumule(situations, indexOuvert - 1, r.id) : 0)} %</div>
                          <div className="sit-saisie">
                            {champ(r.id, [r.id], pctTexte(pctCumule(situations, indexOuvert, r.id)))}
                            {modifiable && (
                              <button type="button" className="sit-cent" title="Mettre à 100 %" onClick={() => fixerPct([r.id], 100)}>
                                100
                              </button>
                            )}
                          </div>
                          {(() => {
                            const m =
                              montantAvancement(r, pctCumule(situations, indexOuvert, r.id)) -
                              (indexOuvert > 0 ? montantAvancement(r, pctCumule(situations, indexOuvert - 1, r.id)) : 0);
                            return <div className={"sit-num" + (m !== 0 ? " sit-fort" : " sit-muet")}>{euro(m)}</div>;
                          })()}
                        </div>
                      )
                    )}
                  </section>
                );
              })}
            </>
          ) : (
            <p className="simple-list-meta">Aucune situation : cliquez sur « + Nouvelle situation ».</p>
          )}
        </>
      )}
    </div>
  );
}
