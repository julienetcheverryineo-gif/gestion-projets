import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, updateDoc, query, collection, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import SiteFormModal, { formatStatutChantier } from "../components/SiteFormModal";
import ImportMinuteElectriciteModal from "../components/ImportMinuteElectriciteModal";

// Largeurs des 2 colonnes d'identification figées (gel de volets, comme
// dans Excel) : n°, Désignation restent visibles quand on défile vers
// les colonnes Matériel / Main d'œuvre, très nombreuses. (La colonne
// Référence n'est pas affichée — elle ne sert pas sur ce projet — mais
// reste importée et stockée, affichée en infobulle sur la désignation.)
const LARGEUR_NUMERO = 22;
const LARGEUR_DESIGNATION = 460;
const LARGEUR_UNITE = 36;
const LARGEUR_QTE = 40;
// Avec table-layout:fixed, les largeurs de colonnes sont fixées par la
// PREMIÈRE ligne d'en-tête : la cellule fusionnée (N°+Désignation+Unité+Qté)
// doit donc porter la somme des 4 largeurs, pas seulement N°+Désignation —
// sinon le navigateur répartit sa largeur (trop petite) sur les 4 colonnes
// et écrase la Désignation.
const LARGEUR_ENTETE_FIGEE = LARGEUR_NUMERO + LARGEUR_DESIGNATION + LARGEUR_UNITE + LARGEUR_QTE;

// "4  [Automatisme & Contrôle]" → "4 · Automatisme & Contrôle" : le numéro
// ET le type, comme dans le devis, affichés en tout petit (voir
// .elec-type-code).
function formatTypeFo(texte) {
  if (!texte) return "—";
  const m = texte.match(/^\s*(\d+)\s*\[?\s*([^\]]*?)\s*\]?\s*$/);
  if (!m) return texte.trim();
  const [, numero, label] = m;
  return label ? numero + " · " + label : numero;
}

// Arrondi à 1 chiffre après la virgule, jamais plus.
function formatNombre(n) {
  return (Math.round((n || 0) * 10) / 10).toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function classeAvancement(pct) {
  if (!pct) return "elec-avancement-nul";
  if (pct >= 100) return "elec-avancement-fait";
  return "elec-avancement-partiel";
}

function formatPct(p) {
  return formatNombre(p * 100) + " %";
}

// Regroupe des lignes par Type de FO (même principe que les onglets
// « Récap Avancement FO/MO » du fichier de suivi Excel : pour chaque
// type de FO présent dans les devis, Budget/Prévu = somme du champ
// chiffré (coût total FO ou temps total), Réalisé = ce champ × son %
// d'avancement saisi ligne par ligne, Restant = Budget − Réalisé.
// (Le suivi Excel regroupe aussi les heures de main d'œuvre par Type de
// FO, pas par Type de MO — repris ici à l'identique.)
function calculerRecap(lignes, champValeur, champAvancementPct) {
  const groupes = new Map();
  lignes.forEach((l) => {
    const valeur = l[champValeur] || 0;
    if (!valeur) return;
    const cle = (l.typeFo || "").trim();
    if (!groupes.has(cle)) groupes.set(cle, { cle, budget: 0, realise: 0 });
    const g = groupes.get(cle);
    g.budget += valeur;
    g.realise += (valeur * (l[champAvancementPct] || 0)) / 100;
  });
  const parType = Array.from(groupes.values())
    .map((g) => ({
      libelle: g.cle ? formatTypeFo(g.cle) : "Sans type de FO",
      numero: g.cle ? Number(g.cle.match(/^\s*(\d+)/)?.[1]) : null,
      budget: g.budget,
      realise: g.realise,
      restant: g.budget - g.realise,
      pctAvancement: g.budget > 0 ? g.realise / g.budget : 0,
    }))
    .sort((a, b) => {
      if (a.numero == null) return 1;
      if (b.numero == null) return -1;
      return a.numero - b.numero;
    });
  const total = parType.reduce(
    (acc, l) => {
      acc.budget += l.budget;
      acc.realise += l.realise;
      acc.restant += l.restant;
      return acc;
    },
    { budget: 0, realise: 0, restant: 0 }
  );
  total.pctAvancement = total.budget > 0 ? total.realise / total.budget : 0;
  return { parType, total };
}

function TableauRecap({ titre, sousTitre, recap, uniteValeur, libelleValeur }) {
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header">
        <h2>
          {titre}
          {sousTitre ? " — " + sousTitre : ""}
        </h2>
      </div>
      {recap.parType.length === 0 ? (
        <p className="simple-list-meta">Aucune donnée chiffrée pour ce périmètre.</p>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table table-recap">
            <thead>
              <tr>
                <th className="col-type">Type de FO</th>
                <th className="col-num">{libelleValeur}</th>
                <th className="col-num">Réalisé (avancement)</th>
                <th className="col-avancement">% avancement</th>
                <th className="col-num">Restant</th>
              </tr>
            </thead>
            <tbody>
              {recap.parType.map((l) => (
                <tr key={l.libelle}>
                  <td className="col-type" style={{ fontFamily: "var(--font-ui)" }}>
                    {l.libelle}
                  </td>
                  <td className="col-num">
                    {formatNombre(l.budget)} {uniteValeur}
                  </td>
                  <td className="col-num">
                    {formatNombre(l.realise)} {uniteValeur}
                  </td>
                  <td className="col-avancement">
                    <LigneAvancementBarre pct={l.pctAvancement} />
                  </td>
                  <td className="col-num">
                    {formatNombre(l.restant)} {uniteValeur}
                  </td>
                </tr>
              ))}
              <tr className="table-recap-total">
                <td className="col-type">TOTAL</td>
                <td className="col-num">
                  {formatNombre(recap.total.budget)} {uniteValeur}
                </td>
                <td className="col-num">
                  {formatNombre(recap.total.realise)} {uniteValeur}
                </td>
                <td className="col-avancement">
                  <LigneAvancementBarre pct={recap.total.pctAvancement} />
                </td>
                <td className="col-num">
                  {formatNombre(recap.total.restant)} {uniteValeur}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LigneAvancementBarre({ pct }) {
  const pourcent = Math.max(0, Math.min(100, pct * 100));
  return (
    <div className="recap-avancement-barre">
      <div className="progress-bar">
        <div className={"progress-bar-fill " + classeAvancement(pourcent)} style={{ width: pourcent + "%" }} />
      </div>
      <span>{formatPct(pct)}</span>
    </div>
  );
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

  // "fo" / "mo" : un récapitulatif chantier (tous devis + détail par
  // devis) est affiché à la place du devis ouvert. null = vue normale.
  const [recapActif, setRecapActif] = useState(null);

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [afficherImport, setAfficherImport] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const lignes = toutesLignes
    .filter((l) => devisOuvert && l.devisId === devisOuvert.id)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

  const changerAvancement = async (ligne, champ, valeur) => {
    const v = Math.max(0, Math.min(100, Number(valeur) || 0));
    await updateDoc(doc(db, "elecLignes", ligne.id), { [champ]: v });
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
        const pctFo = (l.avancementFo ?? l.avancement ?? 0) / 100;
        const pctMo = (l.avancementMo ?? l.avancement ?? 0) / 100;
        acc.budgetMateriel += l.coutTotalFo || 0;
        acc.realiseMateriel += (l.coutTotalFo || 0) * pctFo;
        acc.heuresPrevues += l.tempsTotalHeures || 0;
        acc.heuresRealisees += (l.tempsTotalHeures || 0) * pctMo;
        return acc;
      },
      { budgetMateriel: 0, realiseMateriel: 0, heuresPrevues: 0, heuresRealisees: 0 }
    );

  // Lignes chiffrables (hors postes) de tout le chantier, tous devis
  // confondus — pour les récapitulatifs par Type de FO.
  const lignesChantier = toutesLignes.filter(
    (l) => l.chantierId === chantierId && !l.estPoste
  );
  const champRecap = recapActif === "mo" ? "tempsTotalHeures" : "coutTotalFo";
  const champAvancementRecap = recapActif === "mo" ? "avancementMo" : "avancementFo";
  const uniteRecap = recapActif === "mo" ? "h" : "€";
  const libelleValeurRecap = recapActif === "mo" ? "Heures prévues" : "Budget matériel";
  const recapSynthese = recapActif
    ? calculerRecap(lignesChantier, champRecap, champAvancementRecap)
    : null;
  const recapParDevis = recapActif
    ? devis.map((d) => ({
        devis: d,
        recap: calculerRecap(
          lignesChantier.filter((l) => l.devisId === d.id),
          champRecap,
          champAvancementRecap
        ),
      }))
    : [];

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
        <div className="elec-toolbar">
          {/* Toujours au même endroit, au-dessus des onglets devis (qui
              peuvent être nombreux et passer à la ligne) : les deux
              récapitulatifs restent faciles à retrouver. */}
          <div className="chantier-actions-bar chantier-actions-bar-recap">
            <button
              className={recapActif === "fo" ? "btn-primary" : "btn-ghost"}
              onClick={() => setRecapActif(recapActif === "fo" ? null : "fo")}
            >
              📊 Récap FO
            </button>
            <button
              className={recapActif === "mo" ? "btn-primary" : "btn-ghost"}
              onClick={() => setRecapActif(recapActif === "mo" ? null : "mo")}
            >
              📊 Récap MO
            </button>
          </div>

          <div className="chantier-actions-bar">
            {devis.map((d) => (
              <button
                key={d.id}
                className={
                  !recapActif && devisOuvert?.id === d.id ? "btn-primary" : "btn-accent"
                }
                onClick={() => {
                  setRecapActif(null);
                  setDevisOuvertId(d.id);
                }}
              >
                {d.nom}
              </button>
            ))}
          </div>
        </div>

          {recapActif && (
            <>
              <TableauRecap
                titre={recapActif === "mo" ? "Récap Avancement MO" : "Récap Avancement FO"}
                sousTitre="synthèse tous devis"
                recap={recapSynthese}
                uniteValeur={uniteRecap}
                libelleValeur={libelleValeurRecap}
              />
              {recapParDevis.map(({ devis: d, recap }) => (
                <TableauRecap
                  key={d.id}
                  titre={recapActif === "mo" ? "Récap Avancement MO" : "Récap Avancement FO"}
                  sousTitre={"devis " + d.nom}
                  recap={recap}
                  uniteValeur={uniteRecap}
                  libelleValeur={libelleValeurRecap}
                />
              ))}
            </>
          )}

          {!recapActif && devisOuvert && (
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
                      {formatNombre(synthese.realiseMateriel)} € / {formatNombre(synthese.budgetMateriel)} €
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
                      {formatNombre(synthese.heuresRealisees)} h / {formatNombre(synthese.heuresPrevues)} h
                    </div>
                  </div>
                </div>
              </div>

              <div className="data-table-wrapper elec-lignes-wrapper">
                <table className="data-table elec-lignes-table">
                  <thead>
                    <tr className="elec-entete-groupes">
                      <th
                        colSpan={4}
                        className="elec-th-figee"
                        style={{ left: 0, width: LARGEUR_ENTETE_FIGEE }}
                      />
                      <th colSpan={5} className="elec-groupe elec-groupe-materiel">
                        Matériel
                      </th>
                      <th colSpan={5} className="elec-groupe elec-groupe-mo">
                        Main d'œuvre
                      </th>
                    </tr>
                    <tr>
                      <th
                        className="elec-th-figee elec-col-etroite"
                        style={{ left: 0, width: LARGEUR_NUMERO }}
                      >
                        N°
                      </th>
                      <th
                        className="elec-th-figee elec-th-figee-bord"
                        style={{ left: LARGEUR_NUMERO, width: LARGEUR_DESIGNATION }}
                      >
                        Désignation
                      </th>
                      <th className="elec-col-etroite" style={{ width: LARGEUR_UNITE }}>
                        Unité
                      </th>
                      <th className="elec-col-etroite" style={{ width: LARGEUR_QTE }}>
                        Qté
                      </th>
                      <th className="elec-col-materiel elec-col-saisie" style={{ width: 100 }}>
                        % avanc. FO
                      </th>
                      <th className="elec-col-materiel" style={{ width: 110 }}>
                        Coût unit.
                      </th>
                      <th className="elec-col-materiel" style={{ width: 220 }}>
                        FO
                      </th>
                      <th className="elec-col-materiel" style={{ width: 120 }}>
                        Coût total FO
                      </th>
                      <th className="elec-col-materiel" style={{ width: 120 }}>
                        Matériel avanc.
                      </th>
                      <th className="elec-col-mo elec-col-saisie" style={{ width: 100 }}>
                        % avanc. MO
                      </th>
                      <th className="elec-col-mo" style={{ width: 90 }}>
                        Temps unit.
                      </th>
                      <th className="elec-col-mo" style={{ width: 220 }}>
                        MO
                      </th>
                      <th className="elec-col-mo" style={{ width: 110 }}>
                        Temps total
                      </th>
                      <th className="elec-col-mo" style={{ width: 120 }}>
                        Heure avanc.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => {
                      const pctFo = l.avancementFo ?? l.avancement ?? 0;
                      const pctMo = l.avancementMo ?? l.avancement ?? 0;
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
                      // La référence (importée mais pas affichée en colonne,
                      // inutile sur ce projet) reste consultable en infobulle
                      // sur la désignation.
                      const titreDesignation = [l.reference, l.detail || l.designation]
                        .filter(Boolean)
                        .join(" — ");
                      return (
                        <tr key={l.id} className={l.informative ? "elec-ligne-informative" : ""}>
                          <td
                            className="elec-td-figee elec-col-etroite"
                            style={{ left: 0, width: LARGEUR_NUMERO }}
                          >
                            {l.code || ""}
                          </td>
                          <td
                            className="elec-td-figee elec-th-figee-bord"
                            style={{ left: LARGEUR_NUMERO, width: LARGEUR_DESIGNATION }}
                            title={titreDesignation}
                          >
                            {l.designation}
                          </td>
                          <td className="elec-col-etroite">{l.unite || "—"}</td>
                          <td className="elec-col-etroite">
                            {l.quantite ? formatNombre(l.quantite) : "—"}
                          </td>
                          <td className="elec-col-materiel elec-col-saisie">
                            {l.informative ? (
                              "—"
                            ) : (
                              <div className={"elec-avancement-input " + classeAvancement(pctFo)}>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  defaultValue={pctFo}
                                  disabled={!peutGerer}
                                  onBlur={(e) => changerAvancement(l, "avancementFo", e.target.value)}
                                />
                                <span>%</span>
                              </div>
                            )}
                          </td>
                          <td className="elec-col-materiel">
                            {l.coutUnitaireFo ? formatNombre(l.coutUnitaireFo) + " €" : "—"}
                          </td>
                          <td className="elec-col-materiel elec-type-code" title={l.typeFo}>
                            {formatTypeFo(l.typeFo)}
                          </td>
                          <td className="elec-col-materiel">
                            {l.coutTotalFo ? formatNombre(l.coutTotalFo) + " €" : "—"}
                          </td>
                          <td className="elec-col-materiel">
                            {l.coutTotalFo ? formatNombre((l.coutTotalFo * pctFo) / 100) + " €" : "—"}
                          </td>
                          <td className="elec-col-mo elec-col-saisie">
                            {l.informative ? (
                              "—"
                            ) : (
                              <div className={"elec-avancement-input " + classeAvancement(pctMo)}>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  defaultValue={pctMo}
                                  disabled={!peutGerer}
                                  onBlur={(e) => changerAvancement(l, "avancementMo", e.target.value)}
                                />
                                <span>%</span>
                              </div>
                            )}
                          </td>
                          <td className="elec-col-mo">
                            {l.tempsUnitaire ? formatNombre(l.tempsUnitaire) + " h" : "—"}
                          </td>
                          <td className="elec-col-mo elec-type-code" title={l.typeMo}>
                            {formatTypeFo(l.typeMo)}
                          </td>
                          <td className="elec-col-mo">
                            {l.tempsTotalHeures ? formatNombre(l.tempsTotalHeures) + " h" : "—"}
                          </td>
                          <td className="elec-col-mo">
                            {l.tempsTotalHeures
                              ? formatNombre((l.tempsTotalHeures * pctMo) / 100) + " h"
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
