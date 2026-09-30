import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, updateDoc, query, collection, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import SiteFormModal, { formatStatutChantier } from "../components/SiteFormModal";
import ImportMinuteElectriciteModal from "../components/ImportMinuteElectriciteModal";

export default function ElectriciteSiteDetail() {
  const { chantierId } = useParams();
  const { isAdmin, profile } = useAuth();
  const peutGerer = isAdmin || profile?.role === "ra_electricite";

  const { documents: chantiers } = useCollection("sites");
  const chantier = chantiers.find((c) => c.id === chantierId);
  const { documents: utilisateurs } = useCollection("users", "email");
  const { documents: tousDevis } = useCollection("elecDevis");
  const { documents: toutesLignes } = useCollection("elecLignes");

  const devis = tousDevis
    .filter((d) => d.chantierId === chantierId)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

  const [devisOuvertId, setDevisOuvertId] = useState(null);
  const devisOuvert = devis.find((d) => d.id === devisOuvertId) ?? devis[0] ?? null;

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [afficherImport, setAfficherImport] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const lignes = toutesLignes
    .filter((l) => devisOuvert && l.devisId === devisOuvert.id)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

  const changerAvancement = async (ligne, valeur) => {
    const v = Math.max(0, Math.min(100, Number(valeur) || 0));
    await updateDoc(doc(db, "elecLignes", ligne.id), { avancement: v });
  };

  const supprimerDevis = async (d) => {
    if (!confirm('Supprimer le devis « ' + d.nom + ' » et toutes ses lignes ?')) return;
    setSuppressionEnCours(true);
    const lignesSnap = await getDocs(
      query(collection(db, "elecLignes"), where("devisId", "==", d.id))
    );
    const batch = writeBatch(db);
    lignesSnap.docs.forEach((doc_) => batch.delete(doc_.ref));
    batch.delete(doc(db, "elecDevis", d.id));
    await batch.commit();
    setSuppressionEnCours(false);
    if (devisOuvertId === d.id) setDevisOuvertId(null);
  };

  // Synthèse du devis ouvert : budget matériel / réalisé et heures
  // prévues / réalisées, sur le même principe que le fichier de suivi
  // (Réalisé = valeur de la ligne × son % d'avancement).
  const synthese = lignes
    .filter((l) => !l.estPoste)
    .reduce(
      (acc, l) => {
        const pct = (l.avancement || 0) / 100;
        acc.budgetMateriel += l.coutTotalFo || 0;
        acc.realiseMateriel += (l.coutTotalFo || 0) * pct;
        acc.heuresPrevues += l.tempsTotalHeures || 0;
        acc.heuresRealisees += (l.tempsTotalHeures || 0) * pct;
        return acc;
      },
      { budgetMateriel: 0, realiseMateriel: 0, heuresPrevues: 0, heuresRealisees: 0 }
    );

  if (!chantier) {
    return <div className="page-loading">Chargement…</div>;
  }

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <p className="page-subtitle">
            <Link to="/electricite">← Chantiers Électricité</Link>
          </p>
          <h1>{chantier.nom}</h1>
          <p className="page-subtitle">
            {chantier.client || "—"} · {formatStatutChantier(chantier.statut)}
            {chantier.responsableChantier ? " · " + chantier.responsableChantier : ""}
          </p>
        </div>
        {peutGerer && (
          <div className="header-actions-row">
            <button className="btn-ghost" onClick={() => setAfficherFormulaire(true)}>
              Modifier le chantier
            </button>
            <button className="btn-primary" onClick={() => setAfficherImport(true)}>
              Importer une minute
            </button>
          </div>
        )}
      </header>

      {devis.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucun devis importé</p>
          <p className="empty-state-description">
            Importez une ou plusieurs minutes de devis pour commencer à suivre l'exécution de ce
            chantier.
          </p>
        </div>
      ) : (
        <>
          <div className="chantier-actions-bar">
            {devis.map((d) => (
              <button
                key={d.id}
                className={devisOuvert?.id === d.id ? "btn-primary" : "btn-accent"}
                onClick={() => setDevisOuvertId(d.id)}
              >
                {d.nom}
              </button>
            ))}
          </div>

          {devisOuvert && (
            <>
              <div className="panel" style={{ marginBottom: 16 }}>
                <div className="panel-header">
                  <h2>Synthèse — {devisOuvert.nom}</h2>
                  {peutGerer && (
                    <button
                      className="btn-ghost btn-danger"
                      onClick={() => supprimerDevis(devisOuvert)}
                      disabled={suppressionEnCours}
                    >
                      Supprimer ce devis
                    </button>
                  )}
                </div>
                <div className="elec-synthese-grid">
                  <div>
                    <div className="simple-list-meta">Matériel réalisé</div>
                    <div className="progress-bar" style={{ marginTop: 4 }}>
                      <div
                        className="progress-bar-fill"
                        style={{
                          width:
                            (synthese.budgetMateriel > 0
                              ? (synthese.realiseMateriel / synthese.budgetMateriel) * 100
                              : 0) + "%",
                        }}
                      />
                    </div>
                    <div className="simple-list-meta" style={{ marginTop: 4 }}>
                      {Math.round(synthese.realiseMateriel).toLocaleString("fr-FR")} € /{" "}
                      {Math.round(synthese.budgetMateriel).toLocaleString("fr-FR")} €
                    </div>
                  </div>
                  <div>
                    <div className="simple-list-meta">Heures réalisées</div>
                    <div className="progress-bar" style={{ marginTop: 4 }}>
                      <div
                        className="progress-bar-fill"
                        style={{
                          width:
                            (synthese.heuresPrevues > 0
                              ? (synthese.heuresRealisees / synthese.heuresPrevues) * 100
                              : 0) + "%",
                        }}
                      />
                    </div>
                    <div className="simple-list-meta" style={{ marginTop: 4 }}>
                      {Math.round(synthese.heuresRealisees)} h / {Math.round(synthese.heuresPrevues)} h
                    </div>
                  </div>
                </div>
              </div>

              <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                <table className="data-table elec-lignes-table">
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th>Unité</th>
                      <th>Qté</th>
                      <th>Coût total FO</th>
                      <th>Temps total</th>
                      <th style={{ width: 140 }}>% avancement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) =>
                      l.estPoste ? (
                        <tr key={l.id} className="elec-ligne-poste">
                          <td
                            data-label="Désignation"
                            colSpan={6}
                            style={{ paddingLeft: 8 + (l.profondeur || 0) * 16 }}
                          >
                            {l.code ? l.code + " — " : ""}
                            {l.designation}
                          </td>
                        </tr>
                      ) : (
                        <tr key={l.id} className={l.informative ? "elec-ligne-informative" : ""}>
                          <td data-label="Désignation" style={{ paddingLeft: 24 }}>
                            {l.designation}
                          </td>
                          <td data-label="Unité">{l.unite || "—"}</td>
                          <td data-label="Qté">{l.quantite || "—"}</td>
                          <td data-label="Coût total FO">
                            {l.coutTotalFo ? Math.round(l.coutTotalFo).toLocaleString("fr-FR") + " €" : "—"}
                          </td>
                          <td data-label="Temps total">
                            {l.tempsTotalHeures ? l.tempsTotalHeures + " h" : "—"}
                          </td>
                          <td data-label="% avancement">
                            {l.informative ? (
                              "—"
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  defaultValue={l.avancement || 0}
                                  disabled={!peutGerer}
                                  className="import-edit-input"
                                  style={{ width: 60 }}
                                  onBlur={(e) => changerAvancement(l, e.target.value)}
                                />
                                <span className="simple-list-meta">%</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {afficherFormulaire && (
        <SiteFormModal
          chantier={chantier}
          utilisateurs={utilisateurs}
          service="electricite"
          onClose={() => setAfficherFormulaire(false)}
        />
      )}

      {afficherImport && (
        <ImportMinuteElectriciteModal
          chantierId={chantierId}
          nbDevisExistants={devis.length}
          onClose={() => setAfficherImport(false)}
        />
      )}
    </div>
  );
}
