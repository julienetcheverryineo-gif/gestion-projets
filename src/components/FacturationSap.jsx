import { Fragment, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { autoriser, choisirDossier, dossierSupporte, lireDossierMemorise } from "../lib/dossierExportSap";
import { extraireFacturationSap, lireParamsSap } from "../lib/extractionSap";

const euro = (n) =>
  Number(n || 0)
    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[  ]/g, " ");
const pct = (v) => String(Math.round((Number(v) || 0) * 10) / 10).replace(".", ",");

// Facturation réellement enregistrée dans SAP (transaction ZSD_ADV), comme la
// table Facturation de GOAT : commandes clients du chantier, montant du poste,
// reste à facturer, factures émises — comparée au cumul de nos situations.
// Stockage dans le document chantier : sapFacturation { importeLe, commandes,
// factures } et commentairesFacturationSap { <cle commande>: texte }.
export default function FacturationSap({ chantierId, chantier, otp, peutGerer, factureSituations }) {
  const [ouverts, setOuverts] = useState(new Set());
  const data = chantier?.sapFacturation || null;
  const commentaires = chantier?.commentairesFacturationSap || {};
  const commandes = data?.commandes || [];
  const factures = data?.factures || [];

  const [etat, setEtat] = useState(null);
  const annule = useRef(false);
  const enCours = etat?.phase === "attente" || etat?.phase === "import";

  const recupererSap = async () => {
    if (!otp) return setEtat({ phase: "erreur", message: "Renseignez le champ « Compte » du chantier (code OTP)." });
    if (!dossierSupporte()) return setEtat({ phase: "erreur", message: "Navigateur non compatible (Chrome ou Edge requis)." });
    try {
      let h = await lireDossierMemorise();
      if (!h) h = await choisirDossier();
      if (!(await autoriser(h))) return setEtat({ phase: "erreur", message: "Accès au dossier d'export refusé." });
      annule.current = false;
      await extraireFacturationSap({
        handle: h,
        chantierId,
        otp,
        params: lireParamsSap(),
        onEtat: setEtat,
        estAnnule: () => annule.current,
      });
    } catch (e) {
      if (e?.name !== "AbortError") setEtat({ phase: "erreur", message: e?.message || String(e) });
    }
  };

  const enregistrerCommentaire = (cle, texte) => {
    const t = texte.trim();
    if ((commentaires[cle] || "") === t) return;
    const maj = { ...commentaires };
    if (t) maj[cle] = t;
    else delete maj[cle];
    return updateDoc(doc(db, "sites", chantierId), { commentairesFacturationSap: maj });
  };

  const totalMontant = commandes.reduce((s, c) => s + c.montantHt, 0);
  const totalReste = commandes.reduce((s, c) => s + c.resteHt, 0);
  const totalFacture = totalMontant - totalReste;
  const ecart = Math.round((totalFacture - (factureSituations || 0)) * 100) / 100;
  const basculer = (cle) =>
    setOuverts((p) => {
      const n = new Set(p);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });

  return (
    <details className="sit-sap">
      <summary>
        <strong>Facturation SAP</strong>
        <span className="simple-list-meta">
          {" "}
          · transaction ZSD_ADV{data?.importeLe ? " · importée le " + new Date(data.importeLe).toLocaleDateString("fr-FR") : ""}
        </span>
        {commandes.length > 0 && (
          <span className={"sit-sap-flag " + (Math.abs(ecart) < 1 ? "ok" : "ecart")}>
            {Math.abs(ecart) < 1
              ? "👍 Cohérent avec les situations"
              : ecart > 0
                ? "⚠ SAP a facturé " + euro(ecart) + " € de plus que les situations"
                : "⚠ Situations en avance de " + euro(-ecart) + " € sur SAP"}
          </span>
        )}
      </summary>
      <div className="sit-sap-corps">
        {peutGerer && (
          <div className="sit-sap-import">
            <button type="button" className="btn btn-primary" disabled={enCours} onClick={recupererSap}>
              ↻ Récupérer depuis SAP
            </button>
            {enCours && (
              <button type="button" className="btn" onClick={() => { annule.current = true; setEtat(null); }}>
                Annuler
              </button>
            )}
            <span className="simple-list-meta">
              {etat ? etat.message : "Extraction automatique de la transaction ZSD_ADV pour ce chantier."}
            </span>
          </div>
        )}
        {etat && (etat.phase === "erreur" || etat.phase === "ok") && (
          <div className={etat.phase === "ok" ? "form-success" : "form-error"}>{etat.message}</div>
        )}
        {commandes.length === 0 ? (
          <p className="simple-list-meta">Aucune donnée SAP importée pour ce chantier.</p>
        ) : (
          <>
            <div className={"sit-sap-synthese" + (Math.abs(ecart) < 1 ? " ok" : " ecart")}>
              <span>
                Marché SAP : <b>{euro(totalMontant)} € HT</b> · facturé : <b>{euro(totalFacture)} €</b> · reste à facturer : <b>{euro(totalReste)} €</b> ({pct(totalMontant ? (totalReste / totalMontant) * 100 : 0)} %)
              </span>
              <span>
                Situations saisies : <b>{euro(factureSituations)} €</b> ·{" "}
                {Math.abs(ecart) < 1 ? (
                  <b>👍 cohérent avec SAP</b>
                ) : ecart > 0 ? (
                  <b>⚠ SAP a facturé {euro(ecart)} € de plus que les situations</b>
                ) : (
                  <b>⚠ les situations dépassent SAP de {euro(-ecart)} € (pas encore facturé dans SAP)</b>
                )}
              </span>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table detail-sap-table sit-sap-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Doc. vente</th>
                    <th>Désignation</th>
                    <th style={{ width: 120 }}>Montant HT</th>
                    <th style={{ width: 120 }}>Facturé</th>
                    <th style={{ width: 120 }}>Reste à facturer</th>
                    <th style={{ width: 70 }}>% facturé</th>
                    <th style={{ width: 220 }}>Commentaire</th>
                  </tr>
                </thead>
                <tbody>
                  {commandes.map((c) => {
                    const fact = factures.filter((f) => f.cle === c.cle).sort((a, b) => String(a.date).split(".").reverse().join("").localeCompare(String(b.date).split(".").reverse().join("")));
                    const ouvert = ouverts.has(c.cle);
                    const facture = c.montantHt - c.resteHt;
                    return (
                      <Fragment key={c.cle}>
                        <tr>
                          <td data-label="Doc. vente">
                            <button type="button" className="btn-ghost recap-sap-toggle" onClick={() => basculer(c.cle)} disabled={fact.length === 0}>
                              {fact.length ? (ouvert ? "▾ " : "▸ ") : ""}
                              {c.docVente}
                            </button>
                          </td>
                          <td data-label="Désignation">
                            {c.designation}
                            <div className="simple-list-meta">
                              {[c.nomDo, c.reference].filter(Boolean).join(" · ")}
                            </div>
                          </td>
                          <td data-label="Montant HT" className="col-num">{euro(c.montantHt)}</td>
                          <td data-label="Facturé" className="col-num">{euro(facture)}</td>
                          <td data-label="Reste à facturer" className="col-num"><b>{euro(c.resteHt)}</b></td>
                          <td data-label="% facturé" className="col-num">{c.montantHt ? pct((facture / c.montantHt) * 100) + " %" : "—"}</td>
                          <td data-label="Commentaire">
                            <input
                              key={c.cle + (commentaires[c.cle] || "")}
                              className="sit-sap-commentaire"
                              defaultValue={commentaires[c.cle] || ""}
                              disabled={!peutGerer}
                              placeholder="…"
                              onBlur={(e) => enregistrerCommentaire(c.cle, e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                            />
                          </td>
                        </tr>
                        {ouvert &&
                          fact.map((f, i) => (
                            <tr key={c.cle + i} className="recap-groupe-ligne">
                              <td></td>
                              <td>
                                {f.libelle || f.type} · {f.date}
                              </td>
                              <td></td>
                              <td className="col-num">{euro(f.montantHt)}</td>
                              <td className="col-num simple-list-meta">TTC {euro(f.montantTtc)}</td>
                              <td></td>
                              <td></td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                  <tr className="table-recap-total">
                    <td></td>
                    <td>TOTAL</td>
                    <td className="col-num">{euro(totalMontant)}</td>
                    <td className="col-num">{euro(totalFacture)}</td>
                    <td className="col-num">{euro(totalReste)}</td>
                    <td className="col-num">{totalMontant ? pct((totalFacture / totalMontant) * 100) + " %" : "—"}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
