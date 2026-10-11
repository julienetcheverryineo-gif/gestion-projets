import { useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ETATS_FACTURATION, etatAutoSap, lireFichierSuivi, rattacherSuivi } from "../lib/suiviFacturation";

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
const dateCourte = (d) => String(d || "").slice(0, 5); // "12.06.2026" -> "12.06"
const dateTri = (d) => String(d).split(".").reverse().join("");

// Suivi de facturation d'un chantier : commandes clients lues dans SAP
// (transaction ZSD_ADV, alimentée par l'import SAP automatique) + état de
// facturation, n° de commande client et commentaire saisis ici, + devis du
// fichier de suivi Excel qui n'ont pas (encore) de commande SAP.
// Stockage dans le document chantier : sapFacturation (données SAP) et
// suiviFacturation { importeLe, lignes: { <cle commande>: { etat, cmdClient,
// devis, commentaire } }, libres: [...] }. commentairesFacturationSap = ancien
// emplacement des commentaires (toujours lu).
export default function FacturationSap({ chantierId, chantier, otp, peutGerer, factureSituations }) {
  const entree = useRef(null);
  const [message, setMessage] = useState(null);
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

  const importerSuivi = async (fichier) => {
    if (!fichier) return;
    setMessage(null);
    try {
      if (!otp) throw new Error("renseignez d'abord le champ « Compte » du chantier (code OTP).");
      const lignes = lireFichierSuivi(await fichier.arrayBuffer());
      const res = rattacherSuivi(lignes, otp, commandes);
      if (res.nbChantier === 0) {
        setMessage({ type: "erreur", texte: "Aucune ligne du fichier ne porte le compte " + otp + " (" + res.nbLignesFichier + " lignes lues)." });
        return;
      }
      await enregistrerSuivi({ importeLe: new Date().toISOString(), lignes: res.lignes, libres: res.libres });
      setMessage({
        type: "ok",
        texte:
          res.nbChantier + " devis du compte " + otp + " : " + Object.keys(res.lignes).length + " rattaché(s) aux commandes SAP, " + res.libres.length + " ajouté(s) aux autres devis.",
      });
    } catch (e) {
      setMessage({ type: "erreur", texte: "Import impossible : " + (e?.message || e) });
    } finally {
      if (entree.current) entree.current.value = "";
    }
  };

  const totalMontant = commandes.reduce((s, c) => s + c.montantHt, 0);
  const totalReste = commandes.reduce((s, c) => s + c.resteHt, 0);
  const totalFacture = totalMontant - totalReste;
  const pctFact = totalMontant ? (totalFacture / totalMontant) * 100 : 0;
  const ecart = Math.round((totalFacture - (factureSituations || 0)) * 100) / 100;
  const coherent = Math.abs(ecart) < 1;

  const selectEtat = (valeur, auto, onChange) => {
    const effectif = valeur || auto || "";
    return (
      <select
        className={"fsap-etat " + classeEtat(effectif) + (valeur ? "" : " auto")}
        value={valeur || ""}
        disabled={!peutGerer}
        title={valeur ? "État saisi" : "État déduit de SAP"}
        onChange={(e) => onChange(e.target.value)}
      >
        {auto !== undefined && <option value="">{auto ? auto + " (SAP)" : "—"}</option>}
        {auto === undefined && <option value="">—</option>}
        {ETATS_FACTURATION.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
    );
  };

  const champCommentaire = (valeur, onSave) => (
    <input
      key={valeur}
      className="fsap-comm"
      defaultValue={valeur}
      disabled={!peutGerer}
      placeholder="Commentaire…"
      onBlur={(e) => e.target.value.trim() !== valeur && onSave(e.target.value.trim())}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );

  return (
    <details className="fsap">
      <summary>
        <strong>Suivi de facturation</strong>
        <span className="fsap-src">SAP ZSD_ADV{data?.importeLe ? " · " + new Date(data.importeLe).toLocaleDateString("fr-FR") : ""}</span>
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

            {commandes.length > 0 && (
              <div className="fsap-liste">
                <div className="fsap-ligne fsap-tete">
                  <span>État</span>
                  <span>Commande</span>
                  <span>Facturation</span>
                  <span>Factures</span>
                  <span>Commentaire</span>
                </div>
                {commandes.map((c) => {
                  const fact = factures.filter((f) => f.cle === c.cle).sort((a, b) => dateTri(a.date).localeCompare(dateTri(b.date)));
                  const facture = c.montantHt - c.resteHt;
                  const p = c.montantHt ? (facture / c.montantHt) * 100 : 0;
                  const l = suivi.lignes?.[c.cle] || {};
                  const auto = etatAutoSap(c);
                  const incoherent = l.etat === "Soldé" && c.resteHt > 0.5;
                  return (
                    <div className="fsap-ligne" key={c.cle}>
                      <div className="fsap-cel-etat">
                        {selectEtat(l.etat, auto, (v) => majLigne(c.cle, { etat: v }))}
                        {incoherent && <i className="fsap-alerte" title={"SAP indique encore " + euro(c.resteHt) + " € à facturer"}>⚠</i>}
                      </div>
                      <div className="fsap-cel-cmd">
                        <div className="fsap-titre">{c.designation}</div>
                        <div className="fsap-meta">
                          {[c.docVente, c.nomDo, c.reference, l.devis].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="fsap-cel-fact">
                        <div className="fsap-montants">
                          <b>{euro(facture)}</b> / {euro(c.montantHt)} €
                        </div>
                        <div className="sit-barre">
                          <i style={{ width: Math.min(100, Math.max(0, p)) + "%" }} />
                        </div>
                        <div className="fsap-meta">
                          {pct(p)} % · reste {euro(c.resteHt)} €
                        </div>
                      </div>
                      <div className="fsap-cel-factures">
                        {fact.length === 0 ? (
                          <span className="fsap-meta">—</span>
                        ) : (
                          fact.map((f, i) => (
                            <span key={i} className={"fsap-chip" + (f.montantHt < 0 ? " annul" : "")} title={f.libelle || f.type}>
                              {dateCourte(f.date)} · {euro(f.montantHt)} €
                            </span>
                          ))
                        )}
                      </div>
                      <div className="fsap-cel-comm">
                        {champCommentaire(l.commentaire ?? anciensCommentaires[c.cle] ?? "", (t) => majLigne(c.cle, { commentaire: t }))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {libres.length > 0 && (
              <>
                <div className="fsap-sous-titre">Autres devis du fichier de suivi (sans commande SAP rattachée)</div>
                <div className="fsap-liste">
                  <div className="fsap-ligne fsap-tete">
                    <span>État</span>
                    <span>Devis</span>
                    <span>Montants</span>
                    <span>Factures</span>
                    <span>Commentaire</span>
                  </div>
                  {libres.map((l, i) => (
                    <div className="fsap-ligne" key={l.devis + i}>
                      <div className="fsap-cel-etat">{selectEtat(l.etat, undefined, (v) => majLibre(i, { etat: v }))}</div>
                      <div className="fsap-cel-cmd">
                        <div className="fsap-titre">{l.designation || l.devis}</div>
                        <div className="fsap-meta">
                          {[l.devis, l.date && new Date(l.date).toLocaleDateString("fr-FR"), l.etatChantier, l.commande && "cde " + l.commande].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="fsap-cel-fact">
                        <div className="fsap-montants">
                          Devis <b>{euro(l.montantDevis)}</b> €
                        </div>
                        {l.montantCommande > 0 && <div className="fsap-meta">Commande {euro(l.montantCommande)} €</div>}
                      </div>
                      <div className="fsap-cel-factures">
                        {l.factures ? l.factures.split("\n").map((f, k) => (
                          <span key={k} className="fsap-chip">{f}</span>
                        )) : <span className="fsap-meta">—</span>}
                      </div>
                      <div className="fsap-cel-comm">{champCommentaire(l.commentaire || "", (t) => majLibre(i, { commentaire: t }))}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {peutGerer && (
          <div className="fsap-pied">
            <input ref={entree} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => importerSuivi(e.target.files?.[0])} />
            <button type="button" className="btn-ghost fsap-import" onClick={() => entree.current?.click()}>
              ⤓ Importer le fichier de suivi (Excel)
            </button>
            {suivi.importeLe && <span className="fsap-meta">importé le {new Date(suivi.importeLe).toLocaleDateString("fr-FR")}</span>}
            {message && <span className={message.type === "ok" ? "form-success" : "form-error"}>{message.texte}</span>}
          </div>
        )}
      </div>
    </details>
  );
}
