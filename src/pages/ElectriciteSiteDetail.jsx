import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, updateDoc, query, collection, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import SiteFormModal, { formatStatutChantier } from "../components/SiteFormModal";
import ImportMinuteElectriciteModal from "../components/ImportMinuteElectriciteModal";

// Largeurs des 3 colonnes d'identification figées (gel de volets, comme
// dans Excel) : n°, Référence, Désignation restent visibles quand on
// défile vers les colonnes Matériel / Main d'œuvre, très nombreuses.
const LARGEUR_NUMERO = 46;
const LARGEUR_REFERENCE = 110;
const LARGEUR_DESIGNATION = 260;

// "4  [Automatisme & Contrôle]" → "Automatisme & Contrôle" : le code
// numérique du type de FO/MO n'apporte rien à l'affichage.
function formatTypeFo(texte) {
  if (!texte) return "—";
  const m = texte.match(/\[(.+)\]/);
  return m ? m[1] : texte;
}

function formatNombre(n) {
  return Math.round(n).toLocaleString("fr-FR");
}

function classeAvancement(pct) {
  if (!pct) return "elec-avancement-nul";
  if (pct >= 100) return "elec-avancement-fait";
  return "elec-avancement-partiel";
}

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

              <div className="data-table-wrapper elec-lignes-wrapper">
                <table className="data-table elec-lignes-table">
                  <thead>
                    <tr className="elec-entete-groupes">
                      <th
                        colSpan={3}
                        className="elec-th-figee"
                        style={{ left: 0, width: LARGEUR_NUMERO + LARGEUR_REFERENCE + LARGEUR_DESIGNATION }}
                      />
                      <th style={{ width: 60 }} />
                      <th colSpan={2} className="elec-groupe elec-groupe-saisie">
                        Saisie
                      </th>
                      <th colSpan={4} className="elec-groupe elec-groupe-materiel">
                        Matériel
                      </th>
                      <th colSpan={4} className="elec-groupe elec-groupe-mo">
                        Main d'œuvre
                      </th>
                    </tr>
                    <tr>
                      <th className="elec-th-figee" style={{ left: 0, width: LARGEUR_NUMERO }}>
                        N°
                      </th>
                      <th
                        className="elec-th-figee"
                        style={{ left: LARGEUR_NUMERO, width: LARGEUR_REFERENCE }}
                      >
                        Référence
                      </th>
                      <th
                        className="elec-th-figee elec-th-figee-bord"
                        style={{ left: LARGEUR_NUMERO + LARGEUR_REFERENCE, width: LARGEUR_DESIGNATION }}
                      >
                        Désignation
                      </th>
                      <th style={{ width: 60 }}>Unité</th>
                      <th className="elec-col-saisie" style={{ width: 110 }}>
                        % avancement
                      </th>
                      <th className="elec-col-saisie" style={{ width: 55 }}>
                        Qté
                      </th>
                      <th className="elec-col-materiel" style={{ width: 90 }}>
                        Coût unit.
                      </th>
                      <th className="elec-col-materiel" style={{ width: 170 }}>
                        Type de FO
                      </th>
                      <th className="elec-col-materiel" style={{ width: 100 }}>
                        Coût total FO
                      </th>
                      <th className="elec-col-materiel" style={{ width: 100 }}>
                        Matériel avanc.
                      </th>
                      <th className="elec-col-mo" style={{ width: 80 }}>
                        Temps unit.
                      </th>
                      <th className="elec-col-mo" style={{ width: 150 }}>
                        Type MO
                      </th>
                      <th className="elec-col-mo" style={{ width: 90 }}>
                        Temps total
                      </th>
                      <th className="elec-col-mo" style={{ width: 100 }}>
                        Heure avanc.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => {
                      const pct = l.avancement || 0;
                      if (l.estPoste) {
                        return (
                          <tr key={l.id} className="elec-ligne-poste">
                            <td colSpan={14} style={{ paddingLeft: 8 + (l.profondeur || 0) * 16 }}>
                              {l.code ? l.code + " — " : ""}
                              {l.designation}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={l.id} className={l.informative ? "elec-ligne-informative" : ""}>
                          <td
                            className="elec-td-figee"
                            style={{ left: 0, width: LARGEUR_NUMERO }}
                          >
                            {l.code || ""}
                          </td>
                          <td
                            className="elec-td-figee"
                            style={{ left: LARGEUR_NUMERO, width: LARGEUR_REFERENCE }}
                            title={l.reference}
                          >
                            {l.reference || "—"}
                          </td>
                          <td
                            className="elec-td-figee elec-th-figee-bord"
                            style={{ left: LARGEUR_NUMERO + LARGEUR_REFERENCE, width: LARGEUR_DESIGNATION }}
                            title={l.detail || l.designation}
                          >
                            {l.designation}
                          </td>
                          <td>{l.unite || "—"}</td>
                          <td className="elec-col-saisie">
                            {l.informative ? (
                              "—"
                            ) : (
                              <div className={"elec-avancement-input " + classeAvancement(pct)}>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  defaultValue={pct}
                                  disabled={!peutGerer}
                                  onBlur={(e) => changerAvancement(l, e.target.value)}
                                />
                                <span>%</span>
                              </div>
                            )}
                          </td>
                          <td className="elec-col-saisie">{l.quantite || "—"}</td>
                          <td className="elec-col-materiel">
                            {l.coutUnitaireFo ? formatNombre(l.coutUnitaireFo) + " €" : "—"}
                          </td>
                          <td className="elec-col-materiel" title={l.typeFo}>
                            {formatTypeFo(l.typeFo)}
                          </td>
                          <td className="elec-col-materiel">
                            {l.coutTotalFo ? formatNombre(l.coutTotalFo) + " €" : "—"}
                          </td>
                          <td className="elec-col-materiel">
                            {l.coutTotalFo ? formatNombre((l.coutTotalFo * pct) / 100) + " €" : "—"}
                          </td>
                          <td className="elec-col-mo">
                            {l.tempsUnitaire ? l.tempsUnitaire + " h" : "—"}
                          </td>
                          <td className="elec-col-mo" title={l.typeMo}>
                            {formatTypeFo(l.typeMo)}
                          </td>
                          <td className="elec-col-mo">
                            {l.tempsTotalHeures ? l.tempsTotalHeures + " h" : "—"}
                          </td>
                          <td className="elec-col-mo">
                            {l.tempsTotalHeures
                              ? formatNombre((l.tempsTotalHeures * pct) / 100) + " h"
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
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
