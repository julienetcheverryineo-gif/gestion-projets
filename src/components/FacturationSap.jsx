import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ETATS_CHANTIER, ETATS_FACTURATION, etatAutoSap } from "../lib/suiviFacturation";

const euro = (n) =>
  Number(n || 0)
    .toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[  ]/g, " ");
const pct = (v) => String(Math.round((Number(v) || 0) * 10) / 10).replace(".", ",");
const classeEtat = (e) =>
  "etat-" +
  String(e || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-");
const dateFr = (d) => String(d || "").replace(/\./g, "/"); // "12.06.2026" -> "12/06/2026"
const dateObj = (d) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(d || "").trim());
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
};
// Statut d'une facture SAP : payee (vert), attente (orange), retard (rouge), annulee (gris).
function statutFacture(f) {
  if (f.annulee) return "annulee";
  if (f.payee) return "payee";
  const ech = dateObj(f.echeance);
  const finJour = new Date();
  finJour.setHours(0, 0, 0, 0);
  if (f.retardJours > 0 || (ech && ech < finJour)) return "retard";
  return "attente";
}
const LIBELLE_STATUT = { payee: "payée", attente: "à régler", retard: "échéance dépassée", annulee: "annulée (avoir)" };
const dateIsoFr = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "");
const dateTri = (d) => String(d).split(".").reverse().join("");

// Suivi de facturation d'un chantier : commandes clients lues dans SAP
// (transaction ZSD_ADV, alimentée par l'import SAP automatique) + état de
// facturation, n° de commande client et commentaire saisis ici, + devis du
// fichier de suivi Excel qui n'ont pas (encore) de commande SAP.
// Stockage dans le document chantier : sapFacturation (données SAP) et
// suiviFacturation { importeLe, lignes: { <cle commande>: { etat, cmdClient,
// devis, commentaire } }, libres: [...] }. commentairesFacturationSap = ancien
// emplacement des commentaires (toujours lu).
export default function FacturationSap({ chantierId, chantier, peutGerer, factureSituations }) {
  const data = chantier?.sapFacturation || null;
  const suivi = chantier?.suiviFacturation || {};
  const anciensCommentaires = chantier?.commentairesFacturationSap || {};
  const commandes = data?.commandes || [];
  const factures = data?.factures || [];
  const libres = suivi.libres || [];

  const enregistrerSuivi = (patch) =>
    updateDoc(doc(db, "sites", chantierId), { suiviFacturation: { ...suivi, ...patch } });
  const majLigne = (cle, patch) =>
    enregistrerSuivi({ lignes: { ...(suivi.lignes || {}), [cle]: { ...(suivi.lignes?.[cle] || {}), ...patch } } });
  const majLibre = (i, patch) => enregistrerSuivi({ libres: libres.map((l, k) => (k === i ? { ...l, ...patch } : l)) });

  const totalMontant = commandes.reduce((s, c) => s + c.montantHt, 0);
  const totalReste = commandes.reduce((s, c) => s + c.resteHt, 0);
  const totalFacture = totalMontant - totalReste;
  const pctFact = totalMontant ? (totalFacture / totalMontant) * 100 : 0;
  const ecart = Math.round((totalFacture - (factureSituations || 0)) * 100) / 100;
  const coherent = Math.abs(ecart) < 1;

  const selectAvancement = (valeur, auto, onChange) => {
    const effectif = valeur || auto || "";
    return (
      <select
        className={"fsap-etat " + classeEtat(effectif) + (valeur ? "" : " auto")}
        value={valeur || ""}
        disabled={!peutGerer}
        title={valeur ? "Avancement saisi" : "Avancement déduit de SAP"}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{auto ? auto + " (SAP)" : "—"}</option>
        {ETATS_FACTURATION.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
    );
  };
  const selectEtatChantier = (valeur, onChange) => (
    <select className="fsap-etat fsap-etat-chantier" value={valeur || ""} disabled={!peutGerer} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {ETATS_CHANTIER.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  );
  const champTexte = (valeur, onSave, placeholder = "…") => (
    <input
      key={valeur}
      className="fsap-comm"
      defaultValue={valeur}
      disabled={!peutGerer}
      placeholder={placeholder}
      onBlur={(e) => e.target.value.trim() !== valeur && onSave(e.target.value.trim())}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
  const lignesSap = [...commandes].sort(
    (a, b) => dateTri(a.creeLe || "").localeCompare(dateTri(b.creeLe || "")) || a.docVente.localeCompare(b.docVente)
  );
  const enteteTable = (
    <thead>
      <tr>
        <th>Date cde</th>
        <th>N° devis</th>
        <th className="fsap-col-desig">Désignation</th>
        <th>État chantier</th>
        <th className="num">Montant devis</th>
        <th>N° commande</th>
        <th className="num">Montant commande</th>
        <th>Avancement</th>
        <th>N° facture</th>
        <th className="fsap-col-comm">Commentaire</th>
      </tr>
    </thead>
  );

  return (
    <details className="fsap">
      <summary>
        <strong>Suivi de facturation</strong>
        {commandes.length > 0 && (
          <span className={"sit-sap-flag " + (coherent ? "ok" : "ecart")}>
            {coherent
              ? "👍 Cohérent avec les situations"
              : ecart > 0
                ? "⚠ SAP a facturé " + euro(ecart) + " € de plus que les situations"
                : "⚠ Situations en avance de " + euro(-ecart) + " € sur SAP"}
          </span>
        )}
      </summary>

      <div className="fsap-corps">
        {commandes.length === 0 && libres.length === 0 ? (
          <p className="simple-list-meta">
            Aucune donnée SAP pour ce chantier : elle arrive avec l'import SAP automatique (renseignez le compte du chantier).
          </p>
        ) : (
          <>
            {commandes.length > 0 && (
              <div className="fsap-kpis">
                <div>
                  <span>Marché SAP</span>
                  <b>{euro(totalMontant)} €</b>
                </div>
                <div>
                  <span>Facturé</span>
                  <b>{euro(totalFacture)} €</b>
                </div>
                <div>
                  <span>Reste à facturer</span>
                  <b>{euro(totalReste)} €</b>
                </div>
                <div className="fsap-kpi-barre">
                  <span>{pct(pctFact)} % facturé</span>
                  <div className="sit-barre">
                    <i style={{ width: Math.min(100, pctFact) + "%" }} />
                  </div>
                </div>
                <div>
                  <span>Situations saisies</span>
                  <b>{euro(factureSituations)} €</b>
                </div>
              </div>
            )}

            <div className="fsap-scroll">
              <table className="fsap-table">
                {enteteTable}
                <tbody>
                  {lignesSap.map((c) => {
                    const fact = factures
                      .filter((f) => f.cle === c.cle)
                      .sort((x, y) => dateTri(x.date).localeCompare(dateTri(y.date)));
                    const facture = c.montantHt - c.resteHt;
                    const l = suivi.lignes?.[c.cle] || {};
                    const auto = etatAutoSap(c);
                    const incoherent = l.etat === "Soldé" && c.resteHt > 0.5;
                    const desigSap = [c.designation, c.designation3].filter(Boolean).join(" / ");
                    return (
                      <tr key={c.cle}>
                        <td className="nowrap">{dateFr(c.creeLe) || "—"}</td>
                        <td className="fsap-col-devis">{champTexte(l.devis || "", (t) => majLigne(c.cle, { devis: t }), "N° devis")}</td>
                        <td className="fsap-col-desig">
                          {champTexte(l.designation ?? desigSap, (t) => majLigne(c.cle, { designation: t }))}
                          <div className="fsap-meta">{[c.nomDo, c.docVente].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td>{selectEtatChantier(l.etatChantier, (v) => majLigne(c.cle, { etatChantier: v }))}</td>
                        <td className="num">{euro(c.montantHt)}</td>
                        <td className="nowrap">{c.reference || l.cmdClient || "—"}</td>
                        <td className="num">
                          {euro(c.montantHt)}
                          <div className="fsap-meta">reste {euro(c.resteHt)}</div>
                        </td>
                        <td>
                          <div className="fsap-cel-etat">
                            {selectAvancement(l.etat, auto, (v) => majLigne(c.cle, { etat: v }))}
                            {incoherent && <i className="fsap-alerte" title={"SAP indique encore " + euro(c.resteHt) + " € à facturer"}>⚠</i>}
                          </div>
                          <div className="sit-barre fsap-barre">
                            <i style={{ width: Math.min(100, Math.max(0, c.montantHt ? (facture / c.montantHt) * 100 : 0)) + "%" }} />
                          </div>
                        </td>
                        <td>
                          <div className="fsap-cel-factures">
                            {fact.length === 0 ? (
                              <span className="fsap-meta">—</span>
                            ) : (
                              fact.map((f, i) => {
                                const st = statutFacture(f);
                                return (
                                  <span
                                    key={i}
                                    className={"fsap-chip st-" + st}
                                    title={[
                                      "Facture " + (f.numero || ""),
                                      LIBELLE_STATUT[st],
                                      f.dateRegl && "réglée le " + dateFr(f.dateRegl),
                                      f.echeance && "échéance " + dateFr(f.echeance),
                                      st === "retard" && f.retardJours > 0 && f.retardJours + " j de retard",
                                      euro(f.montantHt) + " € HT · " + euro(f.montantTtc) + " € TTC",
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  >
                                    {f.numero || dateFr(f.date)}
                                    {c.montantHt ? " (" + pct((f.montantHt / c.montantHt) * 100) + " %)" : ""}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </td>
                        <td className="fsap-col-comm">
                          {champTexte(l.commentaire ?? anciensCommentaires[c.cle] ?? "", (t) => majLigne(c.cle, { commentaire: t }))}
                        </td>
                      </tr>
                    );
                  })}
                  {commandes.length > 0 && (
                    <tr className="fsap-total">
                      <td colSpan={4}>Total SAP</td>
                      <td className="num">{euro(totalMontant)}</td>
                      <td></td>
                      <td className="num">{euro(totalMontant)}</td>
                      <td colSpan={3}>
                        facturé {euro(totalFacture)} € · reste {euro(totalReste)} €
                      </td>
                    </tr>
                  )}
                  {libres.length > 0 && (
                    <tr className="fsap-sep">
                      <td colSpan={10}>Autres devis du fichier de suivi (sans commande SAP rattachée)</td>
                    </tr>
                  )}
                  {libres.map((l, i) => (
                    <tr key={l.devis + i} className="fsap-libre">
                      <td className="nowrap">{dateIsoFr(l.date) || "—"}</td>
                      <td className="fsap-col-devis">{champTexte(l.devis || "", (t) => majLibre(i, { devis: t }), "N° devis")}</td>
                      <td className="fsap-col-desig">{champTexte(l.designation || "", (t) => majLibre(i, { designation: t }))}</td>
                      <td>{selectEtatChantier(l.etatChantier, (v) => majLibre(i, { etatChantier: v }))}</td>
                      <td className="num">{l.montantDevis ? euro(l.montantDevis) : "—"}</td>
                      <td className="nowrap">{champTexte(l.commande || "", (t) => majLibre(i, { commande: t }), "N° cde")}</td>
                      <td className="num">{l.montantCommande ? euro(l.montantCommande) : "—"}</td>
                      <td>{selectAvancement(l.etat, "", (v) => majLibre(i, { etat: v }))}</td>
                      <td>
                        <div className="fsap-cel-factures">
                          {l.factures ? (
                            l.factures.split("\n").map((f, k) => (
                              <span key={k} className="fsap-chip">
                                {f}
                              </span>
                            ))
                          ) : (
                            <span className="fsap-meta">—</span>
                          )}
                        </div>
                      </td>
                      <td className="fsap-col-comm">{champTexte(l.commentaire || "", (t) => majLibre(i, { commentaire: t }))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="fsap-pied">
          <span className="fsap-legende">
            <i className="st-payee">●</i> payée <i className="st-attente">●</i> à régler <i className="st-retard">●</i> échéance dépassée
          </span>
          <span className="fsap-src">SAP ZSD_ADV{data?.importeLe ? " · " + new Date(data.importeLe).toLocaleDateString("fr-FR") : ""}</span>
        </div>
      </div>
    </details>
  );
}
