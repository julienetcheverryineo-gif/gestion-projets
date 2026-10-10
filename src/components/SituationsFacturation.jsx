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

// Situations de travaux d'un chantier : saisie de l'avancement CUMULÉ (%) par
// ligne de la minute (prix de vente de la minute), puis export Excel.
export default function SituationsFacturation({ chantierId, chantier, devis, toutesLignes, peutGerer, onClose }) {
  const { profile } = useAuth();
  const rows = useMemo(() => construireLignesSituation(devis, toutesLignes, chantierId), [devis, toutesLignes, chantierId]);
  const situations = useMemo(() => chantier?.situations || [], [chantier?.situations]);
  const [indexOuvert, setIndexOuvert] = useState(() => (situations.length ? situations.length - 1 : -1));
  const [saisies, setSaisies] = useState({});
  const [export_, setExport] = useState(null);
  const tauxTva = chantier?.tauxTvaSituation ?? TVA_DEFAUT;

  const marche = montantMarche(rows);
  const sit = indexOuvert >= 0 ? situations[indexOuvert] : null;
  const estDerniere = indexOuvert === situations.length - 1;
  const modifiable = peutGerer && estDerniere;

  const enregistrer = (nouvelles) => updateDoc(doc(db, "sites", chantierId), { situations: nouvelles });

  const nouvelleSituation = async () => {
    const precedente = situations[situations.length - 1];
    const s = {
      numero: (precedente?.numero ?? 0) + 1,
      date: aujourdhui(),
      auteur: profile?.nom || profile?.prenom ? [profile?.prenom, profile?.nom].filter(Boolean).join(" ") : "",
      avancements: { ...(precedente?.avancements || {}) },
    };
    await enregistrer([...situations, s]);
    setIndexOuvert(situations.length);
  };

  const supprimerDerniere = async () => {
    if (!estDerniere || !window.confirm("Supprimer la situation " + sit.numero + " ?")) return;
    await enregistrer(situations.slice(0, -1));
    setIndexOuvert(situations.length - 2);
  };

  const majSituation = (patch) =>
    enregistrer(situations.map((s, i) => (i === indexOuvert ? { ...s, ...patch } : s)));

  const fixerPct = (ligneIds, valeur) => {
    const av = { ...sit.avancements };
    ligneIds.forEach((id) => {
      if (valeur === null) delete av[id];
      else av[id] = valeur;
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

  const champ = (cle, ligneIds, valeurAffichee, largeur = "4.6em") => (
    <input
      type="text"
      inputMode="decimal"
      disabled={!modifiable}
      value={saisies[cle] !== undefined ? saisies[cle] : valeurAffichee}
      onChange={(e) => setSaisies((p) => ({ ...p, [cle]: e.target.value }))}
      onBlur={() => valider(ligneIds, cle)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      style={{ width: largeur, textAlign: "right", background: modifiable ? "#ffffcc" : undefined, color: modifiable ? "#222" : undefined }}
    />
  );

  const exporter = async () => {
    setExport({ phase: "attente" });
    try {
      const blob = await genererFichierSituation({ chantier, rows, situations, indexSituation: indexOuvert, tauxTva });
      const nom = `Situation ${sit.numero} - ${(chantier?.nom || "chantier").replace(/[\\/:*?"<>|]+/g, " ").trim()}.xlsx`;
      telecharger(blob, nom);
      setExport({ phase: "ok" });
    } catch (e) {
      setExport({ phase: "erreur", message: e.message });
    }
  };

  // Regroupement des lignes par chapitre pour le remplissage en bloc.
  const chapitres = [];
  rows.forEach((r) => {
    if (r.type === "chapitre" || chapitres.length === 0) chapitres.push({ titre: r.type === "chapitre" ? r : null, items: [] });
    if (r.type !== "chapitre") chapitres[chapitres.length - 1].items.push(r);
  });

  const cumulHt = sit ? totalCumule(rows, situations, indexOuvert) : 0;
  const precedentHt = indexOuvert > 0 ? totalCumule(rows, situations, indexOuvert - 1) : 0;
  const moisHt = Math.round((cumulHt - precedentHt) * 100) / 100;
  const tva = Math.round(moisHt * (tauxTva / 100) * 100) / 100;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1100, width: "96vw" }} onClick={(e) => e.stopPropagation()}>
        <h2>Situations de travaux — facturation</h2>
        {rows.filter((r) => r.type === "ligne").length === 0 ? (
          <p className="simple-list-meta">
            Aucune ligne facturable : importez ou mettez à jour la minute du devis (colonne « PV ligne »).
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              {situations.map((s, i) => (
                <button key={i} className={i === indexOuvert ? "btn-primary" : "btn-ghost"} onClick={() => setIndexOuvert(i)}>
                  Situation {s.numero}
                </button>
              ))}
              {peutGerer && (
                <button className="btn-ghost" onClick={nouvelleSituation}>
                  + Nouvelle situation
                </button>
              )}
              <span className="simple-list-meta" style={{ marginLeft: "auto" }}>
                Montant du marché : <strong>{euro(marche)} € HT</strong>
              </span>
            </div>

            {sit ? (
              <>
                <div className="form-inline" style={{ marginBottom: 10 }}>
                  <label>
                    Date
                    <input type="date" disabled={!modifiable} value={sit.date || ""} onChange={(e) => majSituation({ date: e.target.value })} />
                  </label>
                  <label>
                    Établie par
                    <input disabled={!modifiable} value={sit.auteur || ""} onChange={(e) => majSituation({ auteur: e.target.value })} />
                  </label>
                  <label style={{ maxWidth: 110 }}>
                    TVA (%)
                    <input
                      inputMode="decimal"
                      disabled={!peutGerer}
                      defaultValue={String(tauxTva).replace(".", ",")}
                      onBlur={(e) => {
                        const n = Number(String(e.target.value).replace(",", "."));
                        if (Number.isFinite(n) && n >= 0 && n !== tauxTva) updateDoc(doc(db, "sites", chantierId), { tauxTvaSituation: n });
                      }}
                    />
                  </label>
                </div>
                {!estDerniere && (
                  <p className="simple-list-meta" style={{ marginBottom: 8 }}>
                    Situation passée : consultation et export uniquement (seule la dernière situation est modifiable).
                  </p>
                )}
                <div style={{ maxHeight: "48vh", overflow: "auto", border: "1px solid var(--border)", marginBottom: 10 }}>
                  <table className="table-recap" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Description</th>
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
                              <td className="col-num">{ids.length > 0 && modifiable ? champ("ch" + ci, ids, "", "4.6em") : null}</td>
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
                                <td title={r.texte} style={{ maxWidth: 420, whiteSpace: "pre-line" }}>
                                  {r.texte.split("\n")[0]}
                                </td>
                                <td className="col-num">
                                  {r.quantite} {r.unite}
                                </td>
                                <td className="col-num">{euro(r.pu)}</td>
                                <td className="col-num">{euro(r.total)}</td>
                                <td className="col-num">{pctTexte(indexOuvert > 0 ? pctCumule(situations, indexOuvert - 1, r.id) : 0)} %</td>
                                <td className="col-num">{champ(r.id, [r.id], pctTexte(pctCumule(situations, indexOuvert, r.id)))}</td>
                                <td className="col-num">
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
                <div className="simple-list-meta" style={{ marginBottom: 10 }}>
                  Avancement cumulé : <strong>{euro(cumulHt)} € HT</strong> · à déduire : {euro(precedentHt)} € · <strong>Montant du mois : {euro(moisHt)} € HT</strong> ·
                  TVA {euro(tva)} € · TTC <strong>{euro(moisHt + tva)} €</strong>
                </div>
              </>
            ) : (
              <p className="simple-list-meta">Aucune situation : cliquez sur « + Nouvelle situation ».</p>
            )}
            {export_?.phase === "erreur" && <div className="form-error">⚠ {export_.message}</div>}
          </>
        )}
        <div className="modal-actions">
          {sit && modifiable && (
            <button type="button" className="btn-ghost btn-danger" onClick={supprimerDerniere}>
              Supprimer cette situation
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
          {sit && (
            <button type="button" className="btn-primary" disabled={export_?.phase === "attente"} onClick={exporter}>
              {export_?.phase === "attente" ? "Génération…" : "Exporter la situation " + sit.numero + " (.xlsx)"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
