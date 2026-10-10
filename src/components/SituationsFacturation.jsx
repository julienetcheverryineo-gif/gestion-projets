import { useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { construireLignesSituation, montantAvancement, montantMarche, pctCumule, totalCumule, TVA_DEFAUT } from "../lib/situations";
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
      style={{
        width: "4.6em",
        textAlign: "right",
        background: modifiable ? "#ffffcc" : undefined,
        color: modifiable ? "#222" : undefined,
      }}
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
  const precedentHt = indexOuvert > 0 ? totalCumule(rows, situations, indexOuvert - 1) : 0;
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
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header">
        <h2>
          Situations de travaux{mode === "devis" ? " — par devis" : ""}
        </h2>
        <span className="simple-list-meta">
          Montant {mode === "devis" ? "du devis" : "du marché"} : <strong>{euro(marche)} € HT</strong>
        </span>
      </div>

      {mode === "devis" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {devis.map((d) => (
            <button
              key={d.id}
              className={d.id === devisActif?.id ? "btn-primary" : "btn-ghost"}
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

      {rows.filter((r) => r.type === "ligne").length === 0 ? (
        <p className="simple-list-meta">
          Aucune ligne facturable : importez ou mettez à jour la minute du devis (colonne « PV ligne »).
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            {situations.map((s, i) => (
              <button key={i} className={i === indexOuvert ? "btn-primary" : "btn-ghost"} onClick={() => setChoixIndex(i)}>
                Situation {s.numero}
              </button>
            ))}
            {peutGerer && (
              <button className="btn-ghost" onClick={nouvelleSituation}>
                + Nouvelle situation
              </button>
            )}
          </div>

          {sit ? (
            <>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  Date
                  <input type="date" disabled={!modifiable} value={sit.date || ""} onChange={(e) => majSituation({ date: e.target.value })} />
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  Établie par
                  <input style={{ width: 200 }} disabled={!modifiable} value={sit.auteur || ""} onChange={(e) => majSituation({ auteur: e.target.value })} />
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  TVA (%)
                  <input
                    style={{ width: 70 }}
                    inputMode="decimal"
                    disabled={!peutGerer}
                    defaultValue={String(tauxTva).replace(".", ",")}
                    onBlur={(e) => {
                      const n = Number(String(e.target.value).replace(",", "."));
                      if (Number.isFinite(n) && n >= 0 && n !== tauxTva) updateDoc(doc(db, "sites", chantierId), { tauxTvaSituation: n });
                    }}
                  />
                </label>
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  {modifiable && (
                    <button type="button" className="btn-ghost btn-danger" onClick={supprimerDerniere}>
                      Supprimer cette situation
                    </button>
                  )}
                  <button type="button" className="btn-primary" disabled={export_?.phase === "attente"} onClick={exporter}>
                    {export_?.phase === "attente" ? "Génération…" : "Exporter la situation " + sit.numero + " (.xlsx)"}
                  </button>
                </span>
              </div>
              {!estDerniere && (
                <p className="simple-list-meta" style={{ marginBottom: 8 }}>
                  Situation passée : consultation et export uniquement (seule la dernière situation est modifiable).
                </p>
              )}
              {export_?.phase === "erreur" && <div className="form-error">⚠ {export_.message}</div>}

              <div className="simple-list-meta" style={{ marginBottom: 10 }}>
                Avancement cumulé : <strong>{euro(cumulHt)} € HT</strong> · à déduire : {euro(precedentHt)} € ·{" "}
                <strong>Montant du mois : {euro(moisHt)} € HT</strong> · TVA {euro(tva)} € · TTC <strong>{euro(moisHt + tva)} €</strong>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="table-recap" style={{ width: "100%", tableLayout: "auto" }}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 380 }}>Description</th>
                      <th className="col-num">Qté</th>
                      <th className="col-num">PV unit.</th>
                      <th className="col-num">Total HT</th>
                      <th className="col-num">% précédent</th>
                      <th className="col-num">% cumulé</th>
                      <th className="col-num">Montant période</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapitres.map((ch, ci) => {
                      const ids = ch.items.filter((r) => r.type === "ligne").map((r) => r.id);
                      return [
                        ch.titre && (
                          <tr key={"c" + ci} style={{ background: "var(--bg-subtle, rgba(0,0,0,.05))" }}>
                            <td colSpan={5}>
                              <strong>{ch.titre.texte}</strong>
                            </td>
                            <td className="col-num" title="Applique ce % cumulé à tout le chapitre">
                              {ids.length > 0 && modifiable ? champ("ch" + ci, ids, "") : null}
                            </td>
                            <td className="simple-list-meta" style={{ fontSize: "0.72rem" }}>
                              {ids.length > 0 && modifiable ? "← tout le chapitre" : ""}
                            </td>
                          </tr>
                        ),
                        ...ch.items.map((r) =>
                          r.type === "titre" ? (
                            <tr key={r.id}>
                              <td colSpan={7} style={{ fontWeight: 600 }}>
                                {r.texte}
                              </td>
                            </tr>
                          ) : (
                            <tr key={r.id}>
                              <td title={r.texte} style={{ whiteSpace: "normal" }}>
                                {r.texte.split("\n")[0]}
                              </td>
                              <td className="col-num" style={{ whiteSpace: "nowrap" }}>
                                {r.quantite} {r.unite}
                              </td>
                              <td className="col-num" style={{ whiteSpace: "nowrap" }}>{euro(r.pu)}</td>
                              <td className="col-num" style={{ whiteSpace: "nowrap" }}>{euro(r.total)}</td>
                              <td className="col-num" style={{ whiteSpace: "nowrap" }}>
                                {pctTexte(indexOuvert > 0 ? pctCumule(situations, indexOuvert - 1, r.id) : 0)} %
                              </td>
                              <td className="col-num">{champ(r.id, [r.id], pctTexte(pctCumule(situations, indexOuvert, r.id)))}</td>
                              <td className="col-num" style={{ whiteSpace: "nowrap" }}>
                                {euro(
                                  montantAvancement(r, pctCumule(situations, indexOuvert, r.id)) -
                                    (indexOuvert > 0 ? montantAvancement(r, pctCumule(situations, indexOuvert - 1, r.id)) : 0)
                                )}
                              </td>
                            </tr>
                          )
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="simple-list-meta">Aucune situation : cliquez sur « + Nouvelle situation ».</p>
          )}
        </>
      )}
    </div>
  );
}
