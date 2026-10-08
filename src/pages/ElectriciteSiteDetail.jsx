import { estLigneSomme } from "../lib/ligneSomme";
import BilanFinancier from "../components/BilanFinancier";
import { useTauxHoraires, useParametresFoa } from "../lib/tauxHoraires";
import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  addDoc,
  doc,
  updateDoc,
  query,
  collection,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import SiteFormModal, { formatStatutChantier } from "../components/SiteFormModal";
import { libelleTypeActivite, estLigneMoIgnoree, estActiviteIgnoree, CODES_TYPES_ACTIVITE_CONNUS } from "../lib/typesActiviteSap";
import EnvoyerTachesSapModal from "../components/EnvoyerTachesSapModal";
import GererTachesModal from "../components/GererTachesModal";
import ImportMinuteElectriciteModal from "../components/ImportMinuteElectriciteModal";
import { codeTypeFo, codeMo, libelleTypeFo, resumerPoste } from "../lib/exportGoat";
import { LISTE_TYPES_FO, LISTE_TYPES_MO, valeurType } from "../lib/typesElectricite";
import { lignesFournitureGoat, lignesMainOeuvreGoat } from "../lib/exportGoat";
import { IconeAccess, IconeSap } from "../components/IconesLogiciels";
import EnvoyerFournituresGoatModal from "../components/EnvoyerFournituresGoatModal";
import {
  GENERAL,
  cleSup,
  estCleSup,
  construireRecapMo,
  nouvelIdTache,
  tachesGenerales,
  tachesMoChantier,
} from "../lib/tachesMoSup";
import { otpDepuisCompte } from "../lib/parseSapExports";
import {
  AFFECTATION_HORS_BUDGET,
  cleLigneAchat,
  rapprocherAchats,
  rapprocherHeures,
  cleLigneHeure,
  lireAffectationHeure,
  SEP_AFFECTATION,
} from "../lib/bilanSap";

// Largeurs des 2 colonnes d'identification figées (gel de volets, comme
// dans Excel) : n°, Désignation restent visibles quand on défile vers
// les colonnes Matériel / Main d'œuvre, très nombreuses. (La colonne
// Référence n'est pas affichée — elle ne sert pas sur ce projet — mais
// reste importée et stockée, affichée en infobulle sur la désignation.)
const LARGEUR_NUMERO = 0; // colonne N° supprimée (la désignation démarre en bord de tableau)
const LARGEUR_UNITE = 36;
const LARGEUR_QTE = 68;
// Désignation doit rester large et lisible (c'est le texte qui identifie
// la ligne) : elle n'est plus touchée pour essayer de gagner de la place
// ailleurs — seules les colonnes de type FO/MO (largeurTypeLigne,
// ci-dessous) s'adaptent à l'espace disponible.
const LARGEUR_DESIGNATION = 460;
const LARGEUR_ENTETE_FIGEE = LARGEUR_NUMERO + LARGEUR_DESIGNATION + LARGEUR_UNITE + LARGEUR_QTE;
// Largeurs fixes des colonnes Matériel puis Main d'œuvre (dans l'ordre du
// tableau), hors colonne de type FO/MO (menu déroulant) : celle-ci occupe
// tout l'espace qui reste disponible sur la page (voir largeurTypeLigne
// dans le composant), pour profiter du repli du menu latéral ou d'un
// écran large plutôt que de laisser un vide à droite du tableau — avec un
// plancher pour rester lisible (texte tronqué, complet en infobulle et
// dans la liste déroulante) quand l'espace manque. Ces largeurs-ci
// doivent rester assez généreuses pour loger une saisie (nombre + unité
// €/h) sans chevaucher la colonne suivante.
const LARGEUR_MIN_TYPE_LIGNE = 56;
const LARGEURS_COLONNES_MATERIEL_FIXES = [100, 110, 120, 120];
const LARGEURS_COLONNES_MO_FIXES = [100, 90, 110, 120];
// Avec un en-tête sur 2 lignes (ligne de groupes Matériel/Main d'œuvre +
// ligne des colonnes), table-layout:fixed ne retient QUE les largeurs de
// la 1ère ligne pour fixer chaque colonne (spec CSS2.1 §17.5.2) : une
// cellule avec colSpan qui porte une largeur voit celle-ci divisée à
// parts égales entre les colonnes couvertes, et les largeurs posées sur
// la 2e ligne sont ignorées. On contourne ça avec un <colgroup> (les
// <col> ont priorité sur les cellules pour fixer la largeur de colonne).
// Par ailleurs, une table en table-layout:fixed avec une largeur "auto"
// se comprime pour tenir dans son conteneur dès qu'il est plus étroit
// que la somme des colonnes (au lieu de garder ses largeurs et de
// déclencher le défilement horizontal du wrapper) : on fixe donc aussi
// une largeur explicite sur la table, égale à cette somme (calculée dans
// le composant, où la largeur des colonnes de type est connue).
const SOMME_LARGEURS_FIXES_LIGNES =
  LARGEURS_COLONNES_MATERIEL_FIXES.reduce((a, b) => a + b, 0) +
  LARGEURS_COLONNES_MO_FIXES.reduce((a, b) => a + b, 0);

// Largeur des colonnes fixes du tableau Récap (tout sauf Type de FO, qui
// reçoit le même traitement que Désignation ci-dessus).
const LARGEUR_COL_ORDRE = 68;
const LARGEUR_COL_NUM = 170;
const LARGEUR_COL_AVANCEMENT = 240;
const LARGEUR_MIN_COL_TYPE = 200;
const SOMME_LARGEURS_RECAP_FIXES =
  LARGEUR_COL_ORDRE + LARGEUR_COL_NUM * 3 + LARGEUR_COL_AVANCEMENT;

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

// Montants en euros : toujours 2 chiffres après la virgule.
function formatEuro(n) {
  return (n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Valeur + unité du récap : 2 décimales pour les €, 1 pour les heures.
function formatMontant(n, unite) {
  return unite === "€" ? formatEuro(n) + " €" : formatNombre(n) + " " + unite;
}

function classeAvancement(pct) {
  if (!pct) return "elec-avancement-nul";
  if (pct >= 100) return "elec-avancement-fait";
  return "elec-avancement-partiel";
}

// Moyenne pondérée d'un % d'avancement sur un ensemble de lignes (les
// membres d'un groupe) : Σ(valeur × %) / Σ(valeur). Utilisée aussi bien
// pour l'affichage en lecture seule que comme valeur par défaut d'une
// saisie « tête de groupe » — elle se recalcule à chaque rendu à partir
// des lignes réelles, donc toute modification d'une ligne membre se
// répercute immédiatement sur la ligne de tête du groupe.
function moyennePondereeMembres(membres, champValeur, champPct) {
  const budget = membres.reduce((s, l) => s + (l[champValeur] || 0), 0);
  const realise = membres.reduce(
    (s, l) => s + ((l[champValeur] || 0) * (l[champPct] || 0)) / 100,
    0
  );
  return budget > 0 ? (realise / budget) * 100 : 0;
}

function formatPct(p) {
  return formatNombre(p * 100) + " %";
}

// Ordre d'affichage d'un type de FO/MO dans les tableaux par type (Récap,
// Bilan Achats) : priorité à l'ordre personnalisé saisi par l'utilisateur
// (ordreTypes, stocké par chantier — voir ordreTypesFo/ordreTypesMo sur le
// document chantier), sinon on retombe sur le numéro propre au type (tel
// qu'importé depuis le devis), les types sans numéro passant en dernier.
function comparerOrdreType(ordreTypes, a, b) {
  const oa = ordreTypes[a.cle];
  const ob = ordreTypes[b.cle];
  if (oa != null && ob != null) return oa - ob;
  if (oa != null) return -1;
  if (ob != null) return 1;
  if (a.numero == null) return 1;
  if (b.numero == null) return -1;
  return a.numero - b.numero;
}

// Regroupe des lignes par Type de FO (même principe que les onglets
// « Récap Avancement FO/MO » du fichier de suivi Excel : pour chaque
// type de FO présent dans les devis, Budget/Prévu = somme du champ
// chiffré (coût total FO ou temps total), Réalisé = ce champ × son %
// d'avancement saisi ligne par ligne, Restant = Budget − Réalisé.
// (Le suivi Excel regroupe aussi les heures de main d'œuvre par Type de
// FO, pas par Type de MO — repris ici à l'identique.)
// Taux de chiffrage par défaut d'une affaire (saisi, sinon taux I205).
function totalTauxDefaut(chantier, tauxHoraire) {
  return chantier?.tauxChiffrageMo ?? tauxHoraire("I205") ?? 0;
}

function calculerRecap(lignes, champValeur, champAvancementPct, ordreTypes) {
  const groupes = new Map();
  lignes.forEach((l) => {
    if (estLigneSomme(l)) return;
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
      cle: g.cle,
      libelle: g.cle ? formatTypeFo(g.cle) : champValeur === "tempsTotalHeures" ? "Sans tâche" : "Sans type de FO",
      numero: g.cle ? Number(g.cle.match(/^\s*(\d+)/)?.[1]) : null,
      budget: g.budget,
      realise: g.realise,
      restant: g.budget - g.realise,
      pctAvancement: g.budget > 0 ? g.realise / g.budget : 0,
    }))
    .sort((a, b) => comparerOrdreType(ordreTypes, a, b));
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

// Regroupe les lignes par Type de FO pour le Bilan Achats : à l'intérieur
// de chaque type, une ligne par désignation UNIQUE, quantité additionnée
// quand la même désignation revient (même devis ou devis différents) —
// une vraie liste d'achats groupée, pas un bilan financier.
function calculerAchats(lignes, ordreTypes) {
  const parType = new Map();
  lignes.forEach((l) => {
    const cle = (l.typeFo || "").trim();
    if (!cle) return;
    if (!parType.has(cle)) {
      parType.set(cle, {
        cle,
        libelle: formatTypeFo(cle),
        numero: Number(cle.match(/^\s*(\d+)/)?.[1]),
        articles: new Map(),
      });
    }
    const grp = parType.get(cle);
    const clefArticle = (l.designation || "").trim() || "(sans désignation)";
    if (!grp.articles.has(clefArticle)) {
      grp.articles.set(clefArticle, {
        designation: l.designation || "(sans désignation)",
        unite: l.unite || "",
        quantite: 0,
      });
    }
    grp.articles.get(clefArticle).quantite += l.quantite || 0;
  });
  return Array.from(parType.values())
    .map((g) => ({
      ...g,
      articles: Array.from(g.articles.values()).sort((a, b) =>
        a.designation.localeCompare(b.designation, "fr")
      ),
    }))
    .sort((a, b) => comparerOrdreType(ordreTypes, a, b));
}

function TableauRecap({
  titre,
  sousTitre,
  recap: recapBrut,
  uniteValeur,
  libelleValeur,
  modifiable,
  onModifierGroupe,
  largeurColType,
  portee,
  devisId,
  ordreTypes,
  onModifierOrdre,
  sap,
  sup,
  codesMo,
  onChangerCodeMo,
  profilsMo,
  onChangerProfilMo,
  profilsPossibles,
}) {
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  // Pointages SAP cochés pour une affectation en masse.
  const [triFo, setTriFo] = useState(TRI_FILTRE_VIDE);
  const [triMo, setTriMo] = useState(TRI_FILTRE_VIDE);
  const [selHeures, setSelHeures] = useState(new Set());
  const [cibleLot, setCibleLot] = useState("");
  // Lignes SAP dépliées (clé d'un Type de FO, ou "__hors" / "__mo").
  const [ouverts, setOuverts] = useState(new Set());
  const basculer = (cle) =>
    setOuverts((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(cle)) suivant.delete(cle);
      else suivant.add(cle);
      return suivant;
    });

  // Colonnes "réel SAP" (synthèse tous devis uniquement : SAP ne connaît
  // pas les devis). FO : achats par Type de FO via le Code SAP ; MO :
  // heures pointées, au niveau chantier seulement (SAP n'a pas de Type de
  // FO sur les pointages).
  const sapFo = sap?.type === "fo" ? sap.achats : null;
  const sapMo = sap?.type === "mo" ? sap.heures : null;
  const aSap = Boolean(sapFo || sapMo);
  const avecCode = uniteValeur === "h";
  const recap = recapBrut;
  const codeAffiche = (l) =>
    l.sup
      ? codeMo(codesMo?.[l.cle], resumerPoste(l.libelle) || "TACHE")
      : l.cle
      ? codeMo(codesMo?.[codeTypeFo(l.cle)], resumerPoste(libelleTypeFo(l.cle)) || String(codeTypeFo(l.cle)).slice(0, 8))
      : "";
  const clePourCode = (l) => (l.sup ? l.cle : codeTypeFo(l.cle));
  const codesUtilises = recap.parType.map(codeAffiche).filter(Boolean);
  const libType = uniteValeur === "h" ? "Tâche" : "Type de FO";
  const libelleReel = sapMo ? "Heures réelles (SAP)" : "Achat réel (SAP)";
  const nbColonnes = 6 + (aSap ? 3 : 0) + (avecCode ? 4 : 0);
  const classeReste = (v) => (v < 0 ? "recap-reste-negatif" : "");
  // Détail des lignes d'achat SAP d'un type (ou hors budget) : chaque ligne
  // peut être réaffectée à un autre Type de FO du budget, ou laissée hors
  // budget ; "Automatique" retire la correction (retour à la correspondance
  // par Code SAP).
  const detailSapFo = (lignes) => (
    <tr className="recap-detail-sap">
      <td colSpan={nbColonnes}>
        <table className="data-table">
          <thead>
            <tr>
              {COLONNES_SAP_FO.map((c) => (
                <EnteteSapTriable key={c.champ} colonne={c} etat={triFo} setEtat={setTriFo} />
              ))}
              <th>Affecter à</th>
            </tr>
          </thead>
          <tbody>
            {appliquerTriFiltre(lignes, COLONNES_SAP_FO, triFo).map((a, i) => {
              const cleA = cleLigneAchat(a);
              const manuel = sap?.affectations?.[cleA];
              const valeur =
                manuel && (manuel === AFFECTATION_HORS_BUDGET || sapFo.parCle.has(manuel))
                  ? manuel
                  : "";
              return (
                <tr key={a.id || i}>
                  {COLONNES_SAP_FO.map((c) => (
                    <td key={c.champ} data-label={c.label}>
                      {formatValeurSap(a[c.champ], c.numerique, c.euro)}
                    </td>
                  ))}
                  <td data-label="Affecter à">
                    <select
                      value={valeur}
                      disabled={!sap?.onAffecter}
                      onChange={(e) => sap.onAffecter(cleA, e.target.value)}
                    >
                      <option value="">Automatique (Code SAP)</option>
                      {recap.parType
                        .filter((t) => t.cle)
                        .map((t) => (
                          <option key={t.cle} value={t.cle}>
                            {t.libelle}
                          </option>
                        ))}
                      <option value={AFFECTATION_HORS_BUDGET}>Hors budget</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </td>
    </tr>
  );

  // Détail des heures SAP d'une tâche (ou non affectées) : chaque pointage
  // peut être réaffecté à une tâche du budget.
  const detailSapMo = (lignes) => {
    const lignesAffichees = appliquerTriFiltre(lignes, COLONNES_SAP_MO, triMo);
    const cles = lignesAffichees.map((h) => cleLigneHeure(h));
    const cochees = cles.filter((c) => selHeures.has(c));
    const toutCoche = cles.length > 0 && cochees.length === cles.length;
    const basculerTout = () =>
      setSelHeures((prev) => {
        const n = new Set(prev);
        cles.forEach((c) => (toutCoche ? n.delete(c) : n.add(c)));
        return n;
      });
    const basculerUne = (c) =>
      setSelHeures((prev) => {
        const n = new Set(prev);
        if (n.has(c)) n.delete(c);
        else n.add(c);
        return n;
      });
    const appliquerLot = async () => {
      if (!cochees.length || !sap?.onAffecterLot) return;
      await sap.onAffecterLot(cochees, cibleLot);
      setSelHeures((prev) => {
        const n = new Set(prev);
        cochees.forEach((c) => n.delete(c));
        return n;
      });
    };
    const optionsCible = (sap?.options || []).flatMap((g) =>
      g.taches.map((t) => (
        <option key={g.devisId + t.cle} value={g.devisId + SEP_AFFECTATION + t.cle}>
          {g.nom} — {t.libelle}
        </option>
      ))
    );
    return (
    <tr className="recap-detail-sap">
      <td colSpan={nbColonnes}>
        {sap?.onAffecterLot && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <span className="simple-list-meta">{cochees.length} pointage(s) coché(s)</span>
            <select value={cibleLot} onChange={(e) => setCibleLot(e.target.value)}>
              <option value="">Non affectée</option>
              {optionsCible}
            </select>
            <button type="button" className="btn-primary" disabled={!cochees.length} onClick={appliquerLot}>
              Affecter la sélection
            </button>
          </div>
        )}
        <table className="data-table">
          <thead>
            <tr>
              {sap?.onAffecterLot && (
                <th>
                  <input type="checkbox" checked={toutCoche} onChange={basculerTout} aria-label="Tout cocher" />
                </th>
              )}
              {COLONNES_SAP_MO.map((c) => (
                <EnteteSapTriable key={c.champ} colonne={c} etat={triMo} setEtat={setTriMo} />
              ))}
              <th>Affecter à</th>
            </tr>
          </thead>
          <tbody>
            {lignesAffichees.map((h, i) => {
              const cleH = cleLigneHeure(h);
              const manuel = sap?.affectations?.[cleH];
              const { cle: cleManuelle } = lireAffectationHeure(manuel);
              const valeur = cleManuelle !== null && sapMo.parCle.has(cleManuelle) ? manuel : "";
              const ancienne = manuel && !String(manuel).includes(SEP_AFFECTATION) && valeur === manuel;
              return (
                <tr key={h.id || i}>
                  {sap?.onAffecterLot && (
                    <td>
                      <input type="checkbox" checked={selHeures.has(cleH)} onChange={() => basculerUne(cleH)} />
                    </td>
                  )}
                  {COLONNES_SAP_MO.map((c) => (
                    <td key={c.champ} data-label={c.label}>
                      {c.champ === "typAct" ? libelleTypeActivite(h.typAct) : formatValeurSap(h[c.champ], c.numerique, false)}
                    </td>
                  ))}
                  <td data-label="Affecter à">
                    <select
                      value={valeur}
                      disabled={!sap?.onAffecter}
                      onChange={(e) => sap.onAffecter(cleH, e.target.value)}
                    >
                      <option value="">Non affectée</option>
                      {ancienne && <option value={manuel}>{formatTypeFo(manuel)} (devis non précisé)</option>}
                      {(sap?.options || []).map((g) =>
                        g.taches.map((t) => (
                          <option key={g.devisId + t.cle} value={g.devisId + SEP_AFFECTATION + t.cle}>
                            {g.nom} — {t.libelle}
                          </option>
                        ))
                      )}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </td>
    </tr>
    );
  };

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header">
        <h2>
          {titre}
          {sousTitre ? " — " + sousTitre : ""}
        </h2>
      </div>
      {modifiable && (
        <p className="simple-list-meta" style={{ marginBottom: 10 }}>
          Modifiez un % ici pour l'appliquer d'un coup à toutes les lignes de {libType === "Tâche" ? "cette tâche" : "ce type de FO"}
          {portee === "devis" ? ", dans ce devis." : ", dans tous les devis du chantier."}
        </p>
      )}
      {avecCode && (
        <p className="simple-list-meta" style={{ marginBottom: 8 }}>
          <span className="badge-derogation">≠ chiffrage</span> budget adapté par rapport au chiffrage vendu ·{" "}
          <span className="badge-depassement">⚠ vs vendu</span> heures SAP au-dessus des heures vendues de la tâche.
        </p>
      )}
      {recap.parType.length === 0 ? (
        <p className="simple-list-meta">Aucune donnée chiffrée pour ce périmètre.</p>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table table-recap">
            <thead>
              <tr>
                {!avecCode && (
                  <th className="col-ordre" style={{ width: LARGEUR_COL_ORDRE }}>
                    N°
                  </th>
                )}
                {avecCode && (
                  <th className="col-code" title="Code à 8 caractères : tâche SAP et poste GOAT">
                    Code tâche SAP
                  </th>
                )}
                <th className="col-type" style={{ width: largeurColType }}>
                  {libType}
                </th>
                {avecCode && (
                  <th className="col-petit" title="Type de personnel prévu à la base (taux horaire du bilan financier)">
                    Profil prévu
                  </th>
                )}
                {avecCode && <th className="col-num col-petit">Vendu</th>}
                {avecCode && <th className="col-num col-petit" title="Heures ajoutées (+) ou retirées (−) par rapport au chiffrage">Écart ± h</th>}
                {avecCode && <th className="col-num col-petit" title="Heures prises sur la ligne « Sans tâche »">Pris sur « Sans tâche »</th>}
                <th className="col-num">{libelleValeur}</th>
                <th className="col-num">Réalisé (avancement)</th>
                <th className="col-avancement">% avancement</th>
                <th className="col-num">Restant</th>
                {aSap && <th className="col-num">{libelleReel}</th>}
                {aSap && <th className="col-num">Reste budget</th>}
                {aSap && <th className="col-avancement">Réel / Budget</th>}
              </tr>
            </thead>
            <tbody>
              {recap.parType.map((l, index) => {
                const reelSap = sapMo && l.cle ? sapMo.parCle.get(l.cle)?.reel || 0 : 0;
                const depasseVendu = Boolean(sapMo && l.cle && l.vendu > 0 && reelSap > l.vendu + 0.005);
                const detailDerogation =
                  "Chiffrage (vendu) : " + formatNombre(l.vendu || 0) + " h" +
                  (l.ajoute ? " · " + (l.ajoute > 0 ? "+" : "") + formatNombre(l.ajoute) + " h ajustées" : "") +
                  (l.preleve ? " · +" + formatNombre(l.preleve) + " h prises sur « Sans tâche »" : "") +
                  (l.preleveEffectif ? " · −" + formatNombre(l.preleveEffectif) + " h redistribuées vers des tâches" : "");
                return (
                <Fragment key={l.libelle}>
                <tr className={l.deroge ? "recap-derogation" : ""}>
                  {!avecCode && (
                  <td className="col-ordre" data-label="N°">
                    {onModifierOrdre ? (
                      <input
                        type="number"
                        className="elec-ordre-input"
                        key={ordreTypes?.[l.cle] ?? index + 1}
                        defaultValue={ordreTypes?.[l.cle] ?? index + 1}
                        title="Ordre d'affichage de ce type (utilisé aussi pour le futur planning)"
                        onBlur={(e) => onModifierOrdre(l.cle, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                      />
                    ) : (
                      ordreTypes?.[l.cle] ?? index + 1
                    )}
                  </td>
                  )}
                  {avecCode && (
                    <td className="col-code" data-label="Code tâche SAP">
                      {l.cle ? (
                        <input
                          className="elec-code-input"
                          maxLength={8}
                          key={codeAffiche(l)}
                          defaultValue={codeAffiche(l)}
                          disabled={!onChangerCodeMo}
                          title="Code à 8 caractères (import SAP des tâches et GOAT) — modifiable"
                          style={
                            codesUtilises.filter((c) => c === codeAffiche(l)).length > 1
                              ? { borderColor: "var(--danger, #c0392b)" }
                              : undefined
                          }
                          onBlur={(e) => onChangerCodeMo && onChangerCodeMo(clePourCode(l), e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      ) : (
                        ""
                      )}
                    </td>
                  )}
                  <td
                    className="col-type"
                    data-label={libType}
                    style={{ fontFamily: "var(--font-ui)" }}
                  >
                    {avecCode && l.cle && !l.sup ? libelleTypeFo(l.cle) : l.libelle}
                    {l.deroge && (
                      <span className="badge-derogation" title={detailDerogation}>
                        ≠ chiffrage
                      </span>
                    )}
                    {depasseVendu && (
                      <span
                        className="badge-depassement"
                        title={"Heures SAP (" + formatNombre(reelSap) + " h) au-dessus des heures vendues (" + formatNombre(l.vendu) + " h)"}
                      >
                        ⚠ +{formatNombre(reelSap - l.vendu)} h vs vendu
                      </span>
                    )}
                    {l.ajustable && sup?.onSupprimer && (
                      <button
                        type="button"
                        className="btn-ghost btn-danger"
                        title="Supprimer cette tâche : ses heures prévues repartent en « Sans tâche »"
                        style={{ marginLeft: 8, padding: "0 6px" }}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Supprimer la tâche « " + l.libelle + " » ? Ses heures prévues repartent en « Sans tâche »."
                            )
                          )
                            sup.onSupprimer(l.tacheId, l);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </td>
                  {avecCode && (
                    <>
                      <td className="col-petit" data-label="Profil prévu">
                        {l.cle ? (
                          <select
                            value={profilsMo?.[clePourCode(l)] || ""}
                            disabled={!onChangerProfilMo}
                            onChange={(e) => onChangerProfilMo(clePourCode(l), e.target.value)}
                            title="Type de personnel prévu à la base pour cette tâche"
                          >
                            <option value="">Par défaut</option>
                            {(profilsPossibles || []).map((c) => (
                              <option key={c} value={c}>
                                {c} | {libelleTypeActivite(c).replace(/ \([^)]*\)$/, "")}
                              </option>
                            ))}
                          </select>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="col-num col-petit" data-label="Vendu">
                        {l.cle || l.vendu ? formatNombre(l.vendu || 0) : ""}
                      </td>
                      <td className="col-num col-petit" data-label="Écart ± h">
                        {l.ajustable && sup?.onChangerHeures ? (
                          <input
                            type="number"
                            step="0.5"
                            className="elec-ordre-input elec-heures-input"
                            key={"a" + l.saisie}
                            defaultValue={l.saisie}
                            title={l.sup ? "Heures ajoutées au budget pour cette tâche" : "Heures ajoutées (+) ou retirées (−) par rapport au chiffrage"}
                            onBlur={(e) => sup.onChangerHeures(l.tacheId, sup.portee, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                          />
                        ) : l.ajustable ? (
                          formatNombre(l.ajoute || 0)
                        ) : (
                          ""
                        )}
                        {l.ajustable && l.dansDevis > 0 && (
                          <div className="simple-list-meta" title="Heures saisies dans les devis">
                            +{formatNombre(l.dansDevis)} devis
                          </div>
                        )}
                      </td>
                      <td className="col-num col-petit" data-label="Pris sur « Sans tâche »">
                        {l.ajustable && sup?.onChangerPrelevement ? (
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            className="elec-ordre-input elec-heures-input"
                            key={"p" + l.prelevePropreSaisi}
                            defaultValue={l.prelevePropreSaisi}
                            title={
                              "Heures prises sur « Sans tâche » (max " +
                              formatNombre((sup.disponible?.(sup.portee, l.tacheId) || 0) + (l.prelevePropreSaisi || 0)) +
                              " h) : retirées de cette ligne, ajoutées à la tâche"
                            }
                            onBlur={(e) => sup.onChangerPrelevement(l.tacheId, sup.portee, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                          />
                        ) : l.ajustable ? (
                          formatNombre(l.preleve || 0)
                        ) : l.preleveEffectif ? (
                          "−" + formatNombre(l.preleveEffectif)
                        ) : (
                          ""
                        )}
                        {l.ajustable && l.preleve - (l.prelevePropreSaisi || 0) > 0 && (
                          <div className="simple-list-meta" title="Heures prises dans les devis">
                            +{formatNombre(l.preleve - (l.prelevePropreSaisi || 0))} devis
                          </div>
                        )}
                      </td>
                    </>
                  )}
                  <td className="col-num" data-label={libelleValeur}>
                    {formatMontant(l.budget, uniteValeur)}
                  </td>
                  <td className="col-num" data-label="Réalisé">
                    {formatMontant(l.realise, uniteValeur)}
                  </td>
                  <td className="col-avancement" data-label="% avancement">
                    {modifiable ? (
                      <LigneAvancementModifiable
                        pct={l.pctAvancement}
                        onValider={(v) => onModifierGroupe(l.cle, l.libelle, v, devisId)}
                      />
                    ) : (
                      <LigneAvancementBarre pct={l.pctAvancement} />
                    )}
                  </td>
                  <td className="col-num" data-label="Restant">
                    {formatMontant(l.restant, uniteValeur)}
                  </td>
                  {sapFo && (() => {
                    const g = sapFo.parCle.get(l.cle);
                    const reste = l.budget - g.reel;
                    return (
                      <>
                        <td className="col-num" data-label={libelleReel}>
                          {g.lignes.length > 0 ? (
                            <button
                              type="button"
                              className="btn-ghost recap-sap-toggle"
                              title="Afficher les lignes d'achat SAP de ce type de FO"
                              onClick={() => basculer(l.cle)}
                            >
                              {ouverts.has(l.cle) ? "▾" : "▸"} {formatEuro(g.reel)} € ({g.lignes.length})
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={"col-num " + classeReste(reste)} data-label="Reste budget">
                          {formatEuro(reste)} €
                        </td>
                        <td className="col-avancement" data-label="Réel / Budget">
                          <BarreReelBudget reel={g.reel} budget={l.budget} />
                        </td>
                      </>
                    );
                  })()}
                  {sapMo && (() => {
                    const g = sapMo.parCle.get(l.cle);
                    const reste = l.budget - g.reel;
                    return (
                      <>
                        <td className="col-num" data-label={libelleReel}>
                          {g.lignes.length > 0 ? (
                            <button
                              type="button"
                              className="btn-ghost recap-sap-toggle"
                              title="Afficher les heures SAP de cette tâche"
                              onClick={() => basculer(l.cle)}
                            >
                              {ouverts.has(l.cle) ? "▾" : "▸"} {formatNombre(g.reel)} h ({g.lignes.length})
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={"col-num " + classeReste(reste)} data-label="Reste budget">
                          {formatMontant(reste, uniteValeur)}
                        </td>
                        <td className="col-avancement" data-label="Réel / Budget">
                          <BarreReelBudget reel={g.reel} budget={l.budget} />
                        </td>
                      </>
                    );
                  })()}
                </tr>
                {sapFo && ouverts.has(l.cle) && detailSapFo(sapFo.parCle.get(l.cle).lignes)}
                {sapMo && ouverts.has(l.cle) && detailSapMo(sapMo.parCle.get(l.cle).lignes)}
                </Fragment>
                );
              })}
              {sapFo && sapFo.horsBudget.lignes.length > 0 && (
                <>
                  <tr>
                    <td className="col-ordre" data-label="N°"></td>
                    <td
                      className="col-type"
                      data-label={libType}
                      style={{ fontFamily: "var(--font-ui)", fontStyle: "italic" }}
                      title="Achats SAP dont le Code SAP ne correspond à aucun Type de FO du budget"
                    >
                      Achats SAP hors budget
                    </td>
                    <td className="col-num" data-label={libelleValeur}>—</td>
                    <td className="col-num" data-label="Réalisé">—</td>
                    <td className="col-avancement" data-label="% avancement"></td>
                    <td className="col-num" data-label="Restant">—</td>
                    <td className="col-num" data-label={libelleReel}>
                      <button
                        type="button"
                        className="btn-ghost recap-sap-toggle"
                        onClick={() => basculer("__hors")}
                      >
                        {ouverts.has("__hors") ? "▾" : "▸"} {formatEuro(sapFo.horsBudget.reel)} € (
                        {sapFo.horsBudget.lignes.length})
                      </button>
                    </td>
                    <td className="col-num" data-label="Reste budget">—</td>
                    <td className="col-avancement" data-label="Réel / Budget"></td>
                  </tr>
                  {ouverts.has("__hors") && detailSapFo(sapFo.horsBudget.lignes)}
                </>
              )}
              {sapMo && sapMo.nonAffectees.lignes.length > 0 && (
                <>
                  <tr>
                    <td className="col-code"></td>
                    <td
                      className="col-type"
                      data-label={libType}
                      style={{ fontFamily: "var(--font-ui)", fontStyle: "italic" }}
                      title="Heures SAP pas encore réaffectées à une tâche"
                    >
                      Heures SAP non affectées
                    </td>
                    <td className="col-petit"></td>
                    <td className="col-petit"></td>
                    <td className="col-petit"></td>
                    <td className="col-petit"></td>
                    <td className="col-num" data-label={libelleValeur}>—</td>
                    <td className="col-num" data-label="Réalisé">—</td>
                    <td className="col-avancement" data-label="% avancement"></td>
                    <td className="col-num" data-label="Restant">—</td>
                    <td className="col-num" data-label={libelleReel}>
                      <button
                        type="button"
                        className="btn-ghost recap-sap-toggle"
                        onClick={() => basculer("__non")}
                      >
                        {ouverts.has("__non") ? "▾" : "▸"} {formatNombre(sapMo.nonAffectees.reel)} h (
                        {sapMo.nonAffectees.lignes.length})
                      </button>
                    </td>
                    <td className="col-num" data-label="Reste budget">—</td>
                    <td className="col-avancement" data-label="Réel / Budget"></td>
                  </tr>
                  {ouverts.has("__non") && detailSapMo(sapMo.nonAffectees.lignes)}
                </>
              )}
              <tr className="table-recap-total">
                {avecCode ? <td className="col-code"></td> : <td className="col-ordre" data-label="N°"></td>}
                <td className="col-type" data-label={libType}>
                  TOTAL
                </td>
                {avecCode && (
                  <>
                    <td className="col-petit"></td>
                    <td className="col-petit"></td>
                    <td className="col-petit"></td>
                    <td className="col-petit"></td>
                  </>
                )}
                <td className="col-num" data-label={libelleValeur}>
                  {formatMontant(recap.total.budget, uniteValeur)}
                </td>
                <td className="col-num" data-label="Réalisé">
                  {formatMontant(recap.total.realise, uniteValeur)}
                </td>
                <td className="col-avancement" data-label="% avancement">
                  <LigneAvancementBarre pct={recap.total.pctAvancement} />
                </td>
                <td className="col-num" data-label="Restant">
                  {formatMontant(recap.total.restant, uniteValeur)}
                </td>
                {aSap && (
                  <>
                    <td className="col-num" data-label={libelleReel}>
                      {sapMo ? (
                        <button
                          type="button"
                          className="btn-ghost recap-sap-toggle"
                          title="Afficher les heures par personne"
                          onClick={() => basculer("__mo")}
                        >
                          {ouverts.has("__mo") ? "▾" : "▸"} {formatNombre(sapMo.totalReel)} h
                        </button>
                      ) : (
                        formatEuro(sapFo.totalReel) + " €"
                      )}
                    </td>
                    <td
                      className={
                        "col-num " + classeReste(recap.total.budget - (sapMo ?? sapFo).totalReel)
                      }
                      data-label="Reste budget"
                    >
                      {formatMontant(recap.total.budget - (sapMo ?? sapFo).totalReel, uniteValeur)}
                    </td>
                    <td className="col-avancement" data-label="Réel / Budget">
                      <BarreReelBudget
                        reel={(sapMo ?? sapFo).totalReel}
                        budget={recap.total.budget}
                      />
                    </td>
                  </>
                )}
              </tr>
              {sapMo && ouverts.has("__mo") && (
                <tr className="recap-detail-sap">
                  <td colSpan={nbColonnes}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Personne</th>
                          <th>Jours pointés</th>
                          <th>Heures</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sapMo.personnes.map((p) => (
                          <tr key={p.nom}>
                            <td data-label="Personne">{p.nom}</td>
                            <td data-label="Jours pointés">{p.nbJours}</td>
                            <td data-label="Heures">{formatNombre(p.heures)} h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {sup?.masquees?.length > 0 && sup?.onRestaurer && (
        <p className="simple-list-meta" style={{ marginTop: 10 }}>
          Tâches supprimées :{" "}
          {sup.masquees.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn-ghost"
              style={{ marginRight: 6 }}
              title="Remettre cette tâche dans le bilan"
              onClick={() => sup.onRestaurer(t.id)}
            >
              ↺ {t.libelle}
            </button>
          ))}
        </p>
      )}
      {sup?.onAjouter && (
        <form
          style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!nouveauLibelle.trim()) return;
            sup.onAjouter(nouveauLibelle.trim(), sup.portee);
            setNouveauLibelle("");
          }}
        >
          <input
            value={nouveauLibelle}
            onChange={(e) => setNouveauLibelle(e.target.value)}
            placeholder={
              sup.portee === GENERAL ? "Nouvelle tâche (au général)" : "Nouvelle tâche (dans ce devis)"
            }
            style={{ minWidth: 220 }}
          />
          <button type="submit" className="btn-ghost" disabled={!nouveauLibelle.trim()}>
            + Ajouter une tâche
          </button>
        </form>
      )}
    </div>
  );
}

// Lien mailto pré-rempli avec le corps du mail de demande de consultation
// pour un type de FO (liste des désignations/quantités) — le destinataire
// et l'objet restent volontairement vides, à saisir à la main dans le
// client de messagerie (Outlook) qui s'ouvre.
function construireMailtoAchat(groupe) {
  const lignesArticles = groupe.articles
    .map((a) => "- " + a.designation + (a.unite ? " — " + formatNombre(a.quantite) + " " + a.unite : " — " + formatNombre(a.quantite)))
    .join("\n");
  const corps =
    "Bonjour,\n\n" +
    "Veuillez trouver ci-dessous une demande de consultation pour les articles suivants (" +
    groupe.libelle +
    ") :\n\n" +
    lignesArticles +
    "\n\nCordialement,";
  return "mailto:?body=" + encodeURIComponent(corps);
}

// Bilan Achats : pour chaque Type de FO, la liste des désignations à
// acheter avec leur quantité totale (additionnée tous devis confondus
// dans ce périmètre) — une vraie liste de courses, pas un bilan financier
// (voir calculerAchats).
function TableauAchats({ titre, sousTitre, achats }) {
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header">
        <h2>
          {titre}
          {sousTitre ? " — " + sousTitre : ""}
        </h2>
      </div>
      {achats.length === 0 ? (
        <p className="simple-list-meta">Aucune ligne avec un type de FO renseigné pour ce périmètre.</p>
      ) : (
        achats.map((groupe) => (
          <div key={groupe.cle} className="elec-achats-groupe">
            <div className="elec-achats-entete-type">
              <h3 className="elec-achats-titre-type">{groupe.libelle}</h3>
              <a className="btn-ghost" href={construireMailtoAchat(groupe)}>
                ✉️ Demande d'achat
              </a>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th className="col-etroite-achats">Unité</th>
                    <th className="col-etroite-achats">Qté totale</th>
                  </tr>
                </thead>
                <tbody>
                  {groupe.articles.map((a) => (
                    <tr key={a.designation}>
                      <td data-label="Désignation">{a.designation}</td>
                      <td className="col-etroite-achats" data-label="Unité">
                        {a.unite || "—"}
                      </td>
                      <td className="col-etroite-achats" data-label="Qté totale">
                        {formatNombre(a.quantite)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const COLONNES_SAP_FO = [
  { champ: "dateDoc", label: "Date" },
  { champ: "grOr", label: "Code SAP" },
  { champ: "nomFournisseur", label: "Fournisseur" },
  { champ: "designation", label: "Désignation" },
  { champ: "quantite", label: "Qté", numerique: true },
  { champ: "valNette", label: "Val. nette €", numerique: true, euro: true },
];
const COLONNES_SAP_MO = [
  { champ: "date", label: "Date" },
  { champ: "nomPrenom", label: "Personne" },
  { champ: "typAct", label: "Type activité" },
  { champ: "heures", label: "Heures", numerique: true },
];

function formatValeurSap(v, numerique, euro) {
  if (v === null || v === undefined || v === "") return "";
  if (!numerique) return String(v);
  return (Number(v) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: euro ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

// Compare deux codes OTP sans tenir compte des points (selon l'export SAP,
// « AAQ2.A0006 » peut apparaître sous la forme « AAQ2A0006 »).
function memeOtp(a, b) {
  return String(a || "").replace(/\./g, "") === String(b || "").replace(/\./g, "");
}

// "10.12.2025" -> timestamp, pour trier du plus récent au plus ancien
// (les champs date de ces lignes sont des chaînes JJ.MM.AAAA, pas
// triables telles quelles).
function tsDateSap(texte) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(texte || "");
  return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0;
}

// Tri + filtre par colonne des tableaux de lignes SAP (en-têtes cliquables).
function texteCelluleSap(l, c) {
  if (c.champ === "typAct") return libelleTypeActivite(l.typAct);
  return formatValeurSap(l[c.champ], c.numerique, c.euro);
}
function valeurTriSap(l, c) {
  if (c.numerique) return Number(l[c.champ]) || 0;
  if (c.champ === "date" || c.champ === "dateDoc") return tsDateSap(l[c.champ]);
  return texteCelluleSap(l, c).toLowerCase();
}
const TRI_FILTRE_VIDE = { tri: null, filtres: {} };
function appliquerTriFiltre(lignes, colonnes, etat) {
  let res = lignes;
  colonnes.forEach((c) => {
    const f = (etat.filtres[c.champ] || "").trim().toLowerCase();
    if (f) res = res.filter((l) => texteCelluleSap(l, c).toLowerCase().includes(f));
  });
  const col = etat.tri && colonnes.find((c) => c.champ === etat.tri.champ);
  if (col) {
    const sens = etat.tri.sens === "desc" ? -1 : 1;
    res = [...res].sort((a, b) => {
      const x = valeurTriSap(a, col);
      const y = valeurTriSap(b, col);
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "fr")) * sens;
    });
  }
  return res;
}
function basculerTri(etat, setEtat, champ) {
  const t = etat.tri;
  const tri = !t || t.champ !== champ ? { champ, sens: "asc" } : t.sens === "asc" ? { champ, sens: "desc" } : null;
  setEtat({ ...etat, tri });
}
// En-tête triable (clic) et filtrable (champ texte sous le libellé).
function EnteteSapTriable({ colonne, etat, setEtat }) {
  const t = etat.tri && etat.tri.champ === colonne.champ ? etat.tri.sens : null;
  return (
    <th>
      <button
        type="button"
        className="btn-link"
        style={{ font: "inherit", fontWeight: "inherit", padding: 0, cursor: "pointer", background: "none", border: 0, color: "inherit" }}
        onClick={() => basculerTri(etat, setEtat, colonne.champ)}
        title="Trier"
      >
        {colonne.label} {t === "asc" ? "▲" : t === "desc" ? "▼" : "↕"}
      </button>
      <input
        type="text"
        placeholder="Filtrer"
        value={etat.filtres[colonne.champ] || ""}
        onChange={(e) => setEtat({ ...etat, filtres: { ...etat.filtres, [colonne.champ]: e.target.value } })}
        style={{ display: "block", width: "100%", minWidth: 60, marginTop: 4, fontSize: 12 }}
      />
    </th>
  );
}

// Suivi SAP d'un chantier : achats et heures réels remontés de SAP (page
// Import SAP, voir lib/parseSapExports.js) pour le code OTP correspondant
// au champ "Compte" du chantier. Les données (déjà filtrées sur cet OTP)
// et le bouton qui affiche ce panneau sont gérés par le composant parent
// — n'existe que lorsqu'une correspondance a été trouvée (voir
// ElectriciteSiteDetail).
function PanneauSap({ otp, achats, heures, onEnvoyerTaches }) {
  const [onglet, setOnglet] = useState("fo");
  const [triFo, setTriFo] = useState(TRI_FILTRE_VIDE);
  const [triMo, setTriMo] = useState(TRI_FILTRE_VIDE);

  const colonnes = onglet === "fo" ? COLONNES_SAP_FO : COLONNES_SAP_MO;
  const etatTri = onglet === "fo" ? triFo : triMo;
  const setEtatTri = onglet === "fo" ? setTriFo : setTriMo;
  const lignesBrutes = onglet === "fo" ? achats : heures;
  const lignes = appliquerTriFiltre(lignesBrutes, colonnes, etatTri);
  const champValeur = onglet === "fo" ? "valNette" : "heures";
  const total = lignes.reduce((s, l) => s + (Number(l[champValeur]) || 0), 0);

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-header">
        <h2><IconeSap /> Suivi SAP — {otp}</h2>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          className={onglet === "fo" ? "btn-primary" : "btn-ghost"}
          onClick={() => setOnglet("fo")}
        >
          💰 Achats ({achats.length})
        </button>
        <button
          className={onglet === "mo" ? "btn-primary" : "btn-ghost"}
          onClick={() => setOnglet("mo")}
        >
          🕐 Heures ({heures.length})
        </button>
        {onEnvoyerTaches && (
          <button
            className="btn-ghost"
            title="Créer les tâches de tous les devis de ce chantier dans SAP (ZCA_TACHES)"
            onClick={onEnvoyerTaches}
          >
            <IconeSap /> Tâches vers SAP
          </button>
        )}
      </div>
      {lignesBrutes.length === 0 ? (
        <p className="simple-list-meta">Aucune ligne SAP de ce type pour ce chantier.</p>
      ) : (
        <>
          <p className="page-subtitle" style={{ marginBottom: 8 }}>
            {lignes.length} ligne(s) — {onglet === "fo" ? "Val. nette totale" : "Heures totales"} :{" "}
            <strong>
              {formatValeurSap(total, true, onglet === "fo")}
              {onglet === "fo" ? " €" : " h"}
            </strong>
          </p>
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {colonnes.map((c) => (
                    <EnteteSapTriable key={c.champ} colonne={c} etat={etatTri} setEtat={setEtatTri} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id}>
                    {colonnes.map((c) => (
                      <td key={c.champ} data-label={c.label}>
                        {c.champ === "typAct" ? libelleTypeActivite(l.typAct) : formatValeurSap(l[c.champ], c.numerique, c.euro)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Indicateur Réel SAP / Budget : barre remplie à hauteur du % consommé
// (plafonnée à 100 %), avec le % écrit dedans — orange à partir de 90 %,
// rouge en cas de dépassement (le % affiché peut alors dépasser 100).
function BarreReelBudget({ reel, budget }) {
  if (!(budget > 0)) return <span className="simple-list-meta">—</span>;
  const pct = (reel / budget) * 100;
  const niveau = pct > 100 ? "depasse" : pct >= 90 ? "alerte" : "ok";
  return (
    <div
      className="reel-budget-barre"
      title={formatNombre(reel) + " / " + formatNombre(budget)}
    >
      <div
        className={"reel-budget-barre-fill " + niveau}
        style={{ width: Math.max(0, Math.min(100, pct)) + "%" }}
      />
      <span className="reel-budget-barre-label">{formatNombre(pct)} %</span>
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

// Saisie groupée depuis la synthèse : modifier ce % applique la même
// valeur à toutes les lignes de ce type, tous devis confondus
// (voir onModifierGroupe dans ElectriciteSiteDetail).
function LigneAvancementModifiable({ pct, onValider }) {
  const pourcent = Math.max(0, Math.min(100, Math.round(pct * 1000) / 10));
  return (
    <div className="recap-avancement-barre recap-avancement-modifiable">
      <div className={"elec-avancement-input " + classeAvancement(pourcent)}>
        <input
          key={pourcent}
          type="number"
          min="0"
          max="100"
          defaultValue={pourcent}
          onBlur={(e) => onValider(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span>%</span>
      </div>
      <div className="progress-bar">
        <div className={"progress-bar-fill " + classeAvancement(pourcent)} style={{ width: pourcent + "%" }} />
      </div>
    </div>
  );
}

// Une ligne normale du tableau des lignes de devis : éditable (% avanc.
// FO/MO, type FO/MO) comme avant. Utilisée aussi bien pour une ligne hors
// groupe que pour la ligne « tête » d'un groupe (auquel cas `entete` lui
// ajoute le bouton +/− qui déplie ses lignes membres, affichées juste en
// dessous avec `imbriquee`) ou pour une ligne membre imbriquée.
function LigneDevisRow({
  ligne: l,
  peutGerer,
  modeSelection,
  selectionnee,
  onBasculerSelection,
  onChangerAvancement,
  onChangerType,
  tachesFo,
  imbriquee,
  entete,
}) {
  // Sur la ligne de tête d'un groupe (entete non nul), le % affiché est
  // toujours la moyenne pondérée actuelle des lignes membres — jamais la
  // valeur propre de la ligne — pour que toute modification d'une ligne
  // membre se répercute immédiatement ici, sans besoin de rouvrir/replier
  // le groupe. La saisie reste possible et recopie alors sur tout le
  // groupe (voir entete.onChangerAvancementGroupe).
  const pctFo = entete
    ? Math.max(0, Math.min(100, Math.round(entete.moyenneFo * 10) / 10))
    : l.avancementFo ?? l.avancement ?? 0;
  const pctMo = entete
    ? Math.max(0, Math.min(100, Math.round(entete.moyenneMo * 10) / 10))
    : l.avancementMo ?? l.avancement ?? 0;
  const titreDesignation = [l.reference, l.detail || l.designation]
    .filter(Boolean)
    .join(" — ");
  // Sur la ligne qui sert de tête à un groupe (entete non nul), Coût
  // total FO et Temps total affichent la somme de tout le groupe (elle
  // y compris) plutôt que sa seule valeur propre, et modifier le % y
  // recopie la même valeur sur toutes les lignes du groupe.
  const coutTotalFoAffiche = entete ? entete.sommeCoutTotalFo : l.coutTotalFo;
  const tempsTotalAffiche = entete ? entete.sommeTempsTotalHeures : l.tempsTotalHeures;
  return (
    <tr
      className={
        (l.informative ? "elec-ligne-informative " : "") +
        (imbriquee ? "elec-ligne-membre-groupe" : "")
      }
    >
      <td
        className="elec-td-figee elec-th-figee-bord"
        style={{ left: LARGEUR_NUMERO, width: LARGEUR_DESIGNATION }}
        title={titreDesignation}
      >
        <div className="elec-designation-cellule">
          {modeSelection && peutGerer && (
            <input type="checkbox" checked={selectionnee} onChange={onBasculerSelection} />
          )}
          {entete && (
            <button
              type="button"
              className="elec-groupe-toggle"
              onClick={entete.onToggle}
              title={entete.ouvert ? "Replier le groupe" : "Déplier le groupe"}
              aria-label={entete.ouvert ? "Replier le groupe" : "Déplier le groupe"}
            >
              {entete.ouvert ? "−" : "+"}
            </button>
          )}
          <span className="elec-designation-texte" style={{ flex: 1, paddingLeft: imbriquee ? 12 : 0 }}>{l.designation}</span>
          {entete && entete.ouvert && peutGerer && (
            <span className="elec-groupe-actions">
              {entete.ouvert && peutGerer && (
                <button
                  type="button"
                  className="btn-ghost btn-danger elec-groupe-dissoudre"
                  onClick={entete.onDissoudre}
                >
                  Dissoudre
                </button>
              )}
            </span>
          )}
        </div>
      </td>
      <td className="elec-col-etroite">{l.unite || "—"}</td>
      <td className="elec-col-etroite">{formatNombre(l.quantite)}</td>
      <td className="elec-col-materiel elec-col-saisie">
        {l.informative ? (
          "—"
        ) : (
          <div className={"elec-avancement-input " + classeAvancement(pctFo)}>
            <input
              key={pctFo}
              type="number"
              min="0"
              max="100"
              defaultValue={pctFo}
              disabled={!peutGerer}
              onBlur={(e) =>
                entete
                  ? entete.onChangerAvancementGroupe("avancementFo", e.target.value)
                  : onChangerAvancement("avancementFo", e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <span>%</span>
          </div>
        )}
      </td>
      <td className="elec-col-materiel">{formatEuro(l.coutUnitaireFo)} €</td>
      <td className="elec-col-materiel elec-type-code">
        <select
          className="elec-type-select"
          title={formatTypeFo(l.typeFo)}
          value={l.typeFo || ""}
          disabled={!peutGerer}
          onChange={(e) => onChangerType("typeFo", e.target.value)}
        >
          <option value="">—</option>
          {l.typeFo &&
            !tachesFo.some((o) => valeurType(o.code, o.label) === l.typeFo) && (
              <option value={l.typeFo}>{formatTypeFo(l.typeFo)}</option>
            )}
          {tachesFo.map((o) => (
            <option key={o.code} value={valeurType(o.code, o.label)}>
              {o.code} · {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="elec-col-materiel">{formatEuro(coutTotalFoAffiche)} €</td>
      <td className="elec-col-materiel">
        {coutTotalFoAffiche ? formatEuro((coutTotalFoAffiche * pctFo) / 100) + " €" : "—"}
      </td>
      <td className="elec-col-mo elec-col-saisie">
        {l.informative ? (
          "—"
        ) : (
          <div className={"elec-avancement-input " + classeAvancement(pctMo)}>
            <input
              key={pctMo}
              type="number"
              min="0"
              max="100"
              defaultValue={pctMo}
              disabled={!peutGerer}
              onBlur={(e) =>
                entete
                  ? entete.onChangerAvancementGroupe("avancementMo", e.target.value)
                  : onChangerAvancement("avancementMo", e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <span>%</span>
          </div>
        )}
      </td>
      <td className="elec-col-mo">{formatNombre(l.tempsUnitaire)} h</td>
      <td className="elec-col-mo elec-type-code">
        <select
          className="elec-type-select"
          title={formatTypeFo(l.typeMo)}
          value={l.typeMo || ""}
          disabled={!peutGerer}
          onChange={(e) => onChangerType("typeMo", e.target.value)}
        >
          <option value="">—</option>
          {l.typeMo &&
            !LISTE_TYPES_MO.some((o) => valeurType(o.code, o.label) === l.typeMo) && (
              <option value={l.typeMo}>{formatTypeFo(l.typeMo)}</option>
            )}
          {LISTE_TYPES_MO.map((o) => (
            <option key={o.code} value={valeurType(o.code, o.label)}>
              {o.code} · {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="elec-col-mo">{formatNombre(tempsTotalAffiche)} h</td>
      <td className="elec-col-mo">
        {tempsTotalAffiche ? formatNombre((tempsTotalAffiche * pctMo) / 100) + " h" : "—"}
      </td>
    </tr>
  );
}

// Ligne « tête de groupe » synthétique, utilisée quand le groupe a été
// créé avec un nouveau nom (pas repris sur une ligne existante) : elle ne
// correspond à aucune ligne de devis réelle, mais affiche le nom du
// groupe, le nombre de lignes membres, la somme de leur Coût total FO et
// Temps total, et un % FO/MO modifiable qui, une fois validé, se recopie
// sur toutes les lignes membres (moyenne pondérée actuelle proposée par
// défaut, pour ne rien écraser tant qu'on ne valide pas une autre valeur).
function GroupeEnteteRow({
  groupe,
  ouvert,
  nbMembres,
  moyenneFo,
  moyenneMo,
  sommeCoutTotalFo,
  sommeTempsTotalHeures,
  onToggle,
  onDissoudre,
  onChangerAvancementGroupe,
  peutGerer,
}) {
  const pctFo = Math.max(0, Math.min(100, Math.round(moyenneFo * 10) / 10));
  const pctMo = Math.max(0, Math.min(100, Math.round(moyenneMo * 10) / 10));
  return (
    <tr className="elec-ligne-groupe-entete">
      <td
        className="elec-td-figee elec-th-figee-bord"
        style={{ left: LARGEUR_NUMERO, width: LARGEUR_DESIGNATION }}
      >
        <div className="elec-designation-cellule">
          <button
            type="button"
            className="elec-groupe-toggle"
            onClick={onToggle}
            title={ouvert ? "Replier le groupe" : "Déplier le groupe"}
            aria-label={ouvert ? "Replier le groupe" : "Déplier le groupe"}
          >
            {ouvert ? "−" : "+"}
          </button>
          <span style={{ flex: 1 }}>
            📁 {groupe.nom}
            <span className="simple-list-meta" style={{ marginLeft: 8 }}>
              {nbMembres} ligne(s)
            </span>
          </span>
          <span className="elec-groupe-actions">
            {ouvert && peutGerer && (
              <button type="button" className="btn-ghost btn-danger elec-groupe-dissoudre" onClick={onDissoudre}>
                Dissoudre
              </button>
            )}
          </span>
        </div>
      </td>
      <td className="elec-col-etroite">—</td>
      <td className="elec-col-etroite">—</td>
      <td className="elec-col-materiel elec-col-saisie">
        <div className={"elec-avancement-input " + classeAvancement(pctFo)}>
          <input
            key={pctFo}
            type="number"
            min="0"
            max="100"
            defaultValue={pctFo}
            disabled={!peutGerer}
            onBlur={(e) => onChangerAvancementGroupe("avancementFo", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <span>%</span>
        </div>
      </td>
      <td className="elec-col-materiel">—</td>
      <td className="elec-col-materiel elec-type-code">—</td>
      <td className="elec-col-materiel">{formatEuro(sommeCoutTotalFo)} €</td>
      <td className="elec-col-materiel">
        {sommeCoutTotalFo ? formatEuro((sommeCoutTotalFo * pctFo) / 100) + " €" : "—"}
      </td>
      <td className="elec-col-mo elec-col-saisie">
        <div className={"elec-avancement-input " + classeAvancement(pctMo)}>
          <input
            key={pctMo}
            type="number"
            min="0"
            max="100"
            defaultValue={pctMo}
            disabled={!peutGerer}
            onBlur={(e) => onChangerAvancementGroupe("avancementMo", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <span>%</span>
        </div>
      </td>
      <td className="elec-col-mo">—</td>
      <td className="elec-col-mo elec-type-code">—</td>
      <td className="elec-col-mo">{formatNombre(sommeTempsTotalHeures)} h</td>
      <td className="elec-col-mo">
        {sommeTempsTotalHeures ? formatNombre((sommeTempsTotalHeures * pctMo) / 100) + " h" : "—"}
      </td>
    </tr>
  );
}

// Modale de création d'un groupe à partir de la sélection courante : soit
// un nouveau nom de groupe, soit le nom (désignation) d'une des lignes
// sélectionnées.
function GroupeLignesModal({ lignesSelection, onConfirmer, onClose }) {
  const [source, setSource] = useState("nouveau");
  const [nouveauNom, setNouveauNom] = useState("");
  const [ligneSourceId, setLigneSourceId] = useState(lignesSelection[0]?.id ?? "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nom =
      source === "existante"
        ? lignesSelection.find((l) => l.id === ligneSourceId)?.designation
        : nouveauNom.trim();
    if (!nom) {
      setErreur("Indiquez un nom de groupe.");
      return;
    }
    setErreur("");
    setEnCours(true);
    await onConfirmer(nom, source === "existante" ? ligneSourceId : null);
    setEnCours(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Grouper {lignesSelection.length} ligne(s)</h2>
        <form onSubmit={handleSubmit} className="form">
          <label className="team-checklist-item">
            <input
              type="radio"
              name="source-nom-groupe"
              checked={source === "nouveau"}
              onChange={() => setSource("nouveau")}
            />
            Nouveau nom de groupe
          </label>
          {source === "nouveau" && (
            <input
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              placeholder="ex : Tableau TGBT 1"
              autoFocus
            />
          )}
          <label className="team-checklist-item">
            <input
              type="radio"
              name="source-nom-groupe"
              checked={source === "existante"}
              onChange={() => setSource("existante")}
            />
            Utiliser le nom d'une ligne sélectionnée
          </label>
          {source === "existante" && (
            <select value={ligneSourceId} onChange={(e) => setLigneSourceId(e.target.value)}>
              {lignesSelection.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.designation}
                </option>
              ))}
            </select>
          )}
          {erreur && <div className="form-error">{erreur}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Création…" : "Grouper"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ElectriciteSiteDetail() {
  const { chantierId } = useParams();
  const { isAdmin, profile } = useAuth();
  const peutGerer = isAdmin || profile?.role === "ra_electricite";

  // Largeur réelle de la page, mesurée en continu (redimensionnement de la
  // fenêtre, repli du menu latéral...) : la colonne Type de FO des
  // tableaux Récap / synthèse, et les colonnes Type de FO/MO du tableau
  // des lignes de devis, s'en servent pour occuper tout l'espace
  // disponible plutôt que de laisser un vide à droite (avec un plancher
  // pour rester lisibles). Désignation, elle, garde une largeur fixe.
  // Ref *callback* (et non useRef + useEffect à dépendances vides) :
  // tant que le chantier n'est pas chargé (plus bas, `if (!chantier)`),
  // le <div className="page"> n'est pas encore monté, donc un effet à
  // `[]` qui lit pageRef.current au montage du composant le trouvait
  // toujours à `null` et l'observateur n'était jamais créé — largeurPage
  // restait bloqué sur sa valeur de repli (1200), d'où des colonnes de
  // type toujours collées à leur largeur plancher, quelle que soit la
  // taille d'écran. La ref callback, elle, est rappelée par React dès
  // que le <div> est réellement attaché au DOM (donc aussi après le
  // premier rendu de chargement), et reconnecte l'observateur à chaque
  // fois.
  const observateurPageRef = useRef(null);
  const [largeurPage, setLargeurPage] = useState(1200);
  const pageRef = useCallback((el) => {
    if (observateurPageRef.current) {
      observateurPageRef.current.disconnect();
      observateurPageRef.current = null;
    }
    if (el && typeof ResizeObserver !== "undefined") {
      const observateur = new ResizeObserver((entries) => {
        if (entries[0]) setLargeurPage(entries[0].contentRect.width);
      });
      observateur.observe(el);
      observateurPageRef.current = observateur;
    }
  }, []);
  // Les tableaux Récap sont dans un .panel (20px de padding de chaque
  // côté) : leur largeur disponible est donc celle de la page moins ce
  // padding.
  const largeurColType = Math.max(
    LARGEUR_MIN_COL_TYPE,
    largeurPage - 40 - SOMME_LARGEURS_RECAP_FIXES
  );
  // Le tableau des lignes de devis est dans un .data-table-wrapper (16px
  // de padding + 1px de bordure de chaque côté, d'où la marge de 40 -
  // plutôt que 32 - prise ici) ; les deux colonnes de type (FO, MO) se
  // partagent tout l'espace restant à parts égales, sans plafond, pour
  // que le tableau utilise toujours la pleine largeur disponible plutôt
  // que de laisser un vide à droite — la largeur totale du tableau
  // (largeurTableLignes, juste en dessous) suit toujours l'espace
  // mesuré, donc ça ne fait normalement pas apparaître d'ascenseur.
  const largeurTypeLigne = Math.max(
    LARGEUR_MIN_TYPE_LIGNE,
    (largeurPage - 40 - LARGEUR_ENTETE_FIGEE - SOMME_LARGEURS_FIXES_LIGNES) / 2
  );
  const largeurTableLignes =
    LARGEUR_ENTETE_FIGEE + SOMME_LARGEURS_FIXES_LIGNES + largeurTypeLigne * 2;
  // Construites à partir des MÊMES constantes que SOMME_LARGEURS_FIXES_LIGNES
  // ci-dessus (et non d'une liste écrite en dur séparément) : un
  // décalage entre les deux avait fait tourner tout le calcul de largeur
  // dans le vide — le <colgroup> utilisait encore d'anciennes largeurs
  // plus généreuses que celles utilisées pour calculer l'espace
  // disponible, donc le tableau rendu dépassait toujours la largeur
  // annoncée par largeurTableLignes, d'où l'ascenseur qui persistait.
  const largeursColonnesMateriel = [
    ...LARGEURS_COLONNES_MATERIEL_FIXES.slice(0, 2),
    largeurTypeLigne,
    ...LARGEURS_COLONNES_MATERIEL_FIXES.slice(2),
  ];
  const largeursColonnesMo = [
    ...LARGEURS_COLONNES_MO_FIXES.slice(0, 2),
    largeurTypeLigne,
    ...LARGEURS_COLONNES_MO_FIXES.slice(2),
  ];

  const { documents: chantiers } = useCollection("sites");
  const chantier = chantiers.find((c) => c.id === chantierId);
  const { documents: utilisateurs } = useCollection("users", "email");
  const { documents: tousDevis } = useCollection("elecDevis");
  const { documents: toutesLignes } = useCollection("elecLignes");
  const { documents: tousGroupes } = useCollection("elecGroupes");
  const { documents: sapLignesFo } = useCollection("sapLignesFo");
  const { documents: sapLignesMo } = useCollection("sapLignesMo");

  // Code OTP correspondant au champ "Compte" de ce chantier (voir
  // lib/parseSapExports.js) et lignes SAP importées qui s'y rattachent —
  // vide tant que rien n'a été importé pour ce chantier.
  const otpSap = useMemo(() => otpDepuisCompte(chantier?.compte), [chantier]);
  const achatsSap = useMemo(
    () =>
      otpSap
        ? sapLignesFo
            .filter((l) => memeOtp(l.otp, otpSap))
            .sort((a, b) => tsDateSap(b.dateDoc) - tsDateSap(a.dateDoc))
        : [],
    [sapLignesFo, otpSap]
  );
  const { taux: tauxHoraire } = useTauxHoraires();
  const paramsFoa = useParametresFoa();
  const heuresSap = useMemo(
    () =>
      otpSap
        ? sapLignesMo.filter((l) => memeOtp(l.otp, otpSap) && !estLigneMoIgnoree(l)).sort((a, b) => tsDateSap(b.date) - tsDateSap(a.date))
        : [],
    [sapLignesMo, otpSap]
  );

  const devis = tousDevis
    .filter((d) => d.chantierId === chantierId)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

  const [devisOuvertId, setDevisOuvertId] = useState(null);
  const devisOuvert = devis.find((d) => d.id === devisOuvertId) ?? devis[0] ?? null;

  // Regroupement de lignes (par devis) : sélection de lignes dans le
  // tableau, puis "Grouper" crée un document elecGroupes et tague les
  // lignes sélectionnées avec son id. Le groupe s'affiche directement
  // dans le tableau des lignes, sur la ligne choisie comme représentante
  // (ligneRepresentativeId) ou, si un nouveau nom a été saisi, sur une
  // ligne de tête synthétique — un bouton +/− la déplie pour afficher ses
  // lignes membres juste en dessous, où l'avancement se gère ligne par
  // ligne comme d'habitude (plus de mode "par groupe").
  const [modeSelection, setModeSelection] = useState(false);
  const [lignesSelectionnees, setLignesSelectionnees] = useState(new Set());
  const [afficherGroupeModal, setAfficherGroupeModal] = useState(false);
  const [afficherTaches, setAfficherTaches] = useState(false);
  const [afficherEnvoiSap, setAfficherEnvoiSap] = useState(false);
  const [afficherEnvoiGoat, setAfficherEnvoiGoat] = useState(null);
  const tachesFo = chantier?.tachesFo || LISTE_TYPES_FO;
  const [groupesOuverts, setGroupesOuverts] = useState(new Set());
  const groupesDuDevis = devisOuvert
    ? tousGroupes.filter((g) => g.devisId === devisOuvert.id)
    : [];
  const basculerGroupeOuvert = (id) => {
    setGroupesOuverts((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  };

  // "fo" / "mo" : un récapitulatif chantier (tous devis + détail par
  // devis) est affiché à la place du devis ouvert. null = vue normale.
  // Par défaut "fo" : à l'ouverture d'un chantier, on arrive directement
  // sur la synthèse Fournitures plutôt que sur un devis.
  const [recapActif, setRecapActif] = useState(null);

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [afficherImport, setAfficherImport] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const lignes = toutesLignes
    .filter((l) => devisOuvert && l.devisId === devisOuvert.id)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

  // Construit la liste finale des lignes à afficher dans le tableau : une
  // ligne de poste ou hors-groupe s'affiche à sa place habituelle ; une
  // ligne qui appartient à un groupe n'apparaît qu'une fois, à l'endroit
  // de sa première occurrence dans l'ordre du devis — soit sous la forme
  // de sa propre ligne (groupe créé à partir d'une ligne existante), soit
  // sous la forme d'une ligne de tête synthétique (nouveau nom de
  // groupe) — suivie, uniquement si le groupe est déplié, de toutes ses
  // autres lignes membres (imbriquées, dans leur ordre d'origine).
  const groupesParId = new Map(groupesDuDevis.map((g) => [g.id, g]));
  const lignesAffichees = (() => {
    const membresParGroupe = new Map();
    lignes.forEach((l) => {
      if (!l.estPoste && l.groupeId && groupesParId.has(l.groupeId)) {
        if (!membresParGroupe.has(l.groupeId)) membresParGroupe.set(l.groupeId, []);
        membresParGroupe.get(l.groupeId).push(l);
      }
    });
    const groupesRendus = new Set();
    const resultat = [];
    lignes.forEach((l) => {
      if (l.estPoste) {
        resultat.push({ kind: "poste", ligne: l });
        return;
      }
      if (l.groupeId && groupesParId.has(l.groupeId)) {
        const g = groupesParId.get(l.groupeId);
        if (groupesRendus.has(g.id)) return;
        groupesRendus.add(g.id);
        const membres = membresParGroupe.get(g.id) || [];
        const ouvert = groupesOuverts.has(g.id);
        if (g.ligneRepresentativeId) {
          const representative = membres.find((m) => m.id === g.ligneRepresentativeId) || l;
          resultat.push({ kind: "representative", ligne: representative, groupe: g, ouvert, membres });
          if (ouvert) {
            membres
              .filter((m) => m.id !== representative.id)
              .forEach((m) => resultat.push({ kind: "membre", ligne: m, groupe: g }));
          }
        } else {
          resultat.push({ kind: "entete", groupe: g, ouvert, membres });
          if (ouvert) {
            membres.forEach((m) => resultat.push({ kind: "membre", ligne: m, groupe: g }));
          }
        }
        return;
      }
      resultat.push({ kind: "normal", ligne: l });
    });
    return resultat;
  })();

  const changerAvancement = async (ligne, champ, valeur) => {
    const v = Math.max(0, Math.min(100, Number(valeur) || 0));
    await updateDoc(doc(db, "elecLignes", ligne.id), { [champ]: v });
  };

  // Change le type de FO ou de MO d'une ligne (menu déroulant).
  const changerType = async (ligne, champ, valeur) => {
    await updateDoc(doc(db, "elecLignes", ligne.id), { [champ]: valeur });
  };

  // Qté, coût unitaire/total et temps unitaire/total viennent du devis
  // importé et ne sont plus modifiables à la main depuis ce tableau (seuls
  // les % d'avancement et le type FO/MO le restent) — évite les incohérences
  // entre Qté × PU et PT que la ressaisie manuelle pouvait introduire.

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
    .filter((l) => !l.estPoste && !estLigneSomme(l))
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
  // Tâches (types de FO) réellement utilisées dans les devis du chantier :
  // code + libellé, pour l'envoi vers SAP.
  const tachesUtilisees = (() => {
    const parCode = new Map();
    const ajoute = (code, libelle) => {
      if (!code || parCode.has(code)) return;
      parCode.set(code, { code, libelle: String(libelle || code).trim() });
    };
    const masqueesIds = new Set((chantier?.tachesMoMasquees || []).map((t) => t.id));
    const vusType = new Set();
    lignesChantier.forEach((l) => {
      const cleType = codeTypeFo(l.typeFo);
      if (!cleType || vusType.has(cleType) || masqueesIds.has("t:" + cleType)) return;
      vusType.add(cleType);
      const connue = tachesFo.find((t) => t.code === cleType);
      const lib = (connue?.label || libelleTypeFo(l.typeFo) || cleType).trim();
      ajoute(codeMo(chantier?.codesMo?.[cleType], resumerPoste(libelleTypeFo(l.typeFo)) || cleType.slice(0, 8)), lib);
    });
    // Tâches complémentaires (suivi, étude, levée de réserve + ajoutées).
    tachesMoChantier(chantier).filter((t) => !masqueesIds.has(t.id)).forEach((t) =>
      ajoute(codeMo(chantier?.codesMo?.[cleSup(t.id)], resumerPoste(t.libelle) || "TACHE"), t.libelle)
    );
    return [...parCode.values()].sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
  })();
  const champRecap = recapActif === "mo" ? "tempsTotalHeures" : "coutTotalFo";
  const champAvancementRecap = recapActif === "mo" ? "avancementMo" : "avancementFo";
  const uniteRecap = recapActif === "mo" ? "h" : "€";
  const libelleValeurRecap = recapActif === "mo" ? "Heures prévues" : "Budget matériel";
  const titreRecap = recapActif === "mo" ? "Récap Avancement MO" : "Récap Avancement FO";
  // Ordre d'affichage des types, personnalisable par chantier (champ
  // onModifierOrdre du N° dans TableauRecap) : sert aujourd'hui à trier
  // Récap et Bilan Achats, et servira plus tard à construire un planning
  // Gantt du chantier dans cet ordre. FO et MO ont chacun le leur.
  const champOrdreChantier = recapActif === "mo" ? "ordreTypesMo" : "ordreTypesFo";
  const ordreTypesChantier = chantier?.[champOrdreChantier] || {};
  // Bilan MO : on y ajoute les tâches complémentaires (socle fixe Suivi /
  // Étude / Levée de réserve + tâches ajoutées), avec leurs heures saisies.
  const avecSup = recapActif === "mo";
  // Heures « Sans tâche » (lignes de devis sans tâche) avant tout prélèvement :
  // base du plafond des heures qu'on peut en retirer vers une tâche.
  const sansTacheBase = {};
  const recapSynthese =
    recapActif === "fo" || recapActif === "mo"
      ? (() => {
          const base = calculerRecap(lignesChantier, champRecap, champAvancementRecap, ordreTypesChantier);
          if (!avecSup) return base;
          const r = construireRecapMo(base, chantier, GENERAL, devis);
          sansTacheBase[GENERAL] = r.sansTacheBrut;
          return r;
        })()
      : null;
  const recapParDevis =
    recapActif === "fo" || recapActif === "mo"
      ? devis.map((d) => {
          const base = calculerRecap(
            lignesChantier.filter((l) => l.devisId === d.id),
            champRecap,
            champAvancementRecap,
            ordreTypesChantier
          );
          if (!avecSup) return { devis: d, recap: base };
          const r = construireRecapMo(base, chantier, d.id, devis);
          sansTacheBase[d.id] = r.sansTacheBrut;
          return { devis: d, recap: r };
        })
      : [];
  // Saisie des heures d'une tâche complémentaire ("" ou 0 retire la valeur).
  const changerHeuresSup = async (tacheId, portee, valeur) => {
    const v = valeur === "" ? 0 : Number(String(valeur).replace(",", "."));
    if (Number.isNaN(v)) return;
    const maj = { ...(chantier?.heuresMoSup || {}) };
    const cle = portee + "||" + tacheId;
    if (v === 0) delete maj[cle];
    else maj[cle] = v;
    await updateDoc(doc(db, "sites", chantierId), { heuresMoSup: maj });
  };
  // Heures prises sur « Sans tâche » et versées à une tâche (le total ne
  // change pas). Plafond : ce qui reste de « Sans tâche » dans ce périmètre
  // (un devis, ou la synthèse = tout ce qui n'est pas déjà pris dans les devis).
  const prelevementsChantier = chantier?.prelevementsMoSup || {};
  const disponibleSansTache = (portee, tacheId) => {
    const pris = Object.entries(prelevementsChantier).reduce((s, [k, v]) => {
      const [scope, id] = k.split("||");
      if (id === tacheId) return s;
      if (portee === GENERAL ? true : scope === portee) return s + (Number(v) || 0);
      return s;
    }, 0);
    return Math.max(0, (sansTacheBase[portee] || 0) - pris);
  };
  const changerPrelevementSup = async (tacheId, portee, valeur) => {
    let v = valeur === "" ? 0 : Number(String(valeur).replace(",", "."));
    if (Number.isNaN(v) || v < 0) return;
    v = Math.min(v, disponibleSansTache(portee, tacheId));
    const maj = { ...prelevementsChantier };
    const cle = portee + "||" + tacheId;
    if (v === 0) delete maj[cle];
    else maj[cle] = Math.round(v * 100) / 100;
    await updateDoc(doc(db, "sites", chantierId), { prelevementsMoSup: maj });
  };
  const codesMoChantier = chantier?.codesMo || {};
  const changerCodeMo = async (cle, valeur) => {
    const code = codeMo(valeur, "");
    const maj = { ...codesMoChantier };
    if (code) maj[cle] = code;
    else delete maj[cle];
    await updateDoc(doc(db, "sites", chantierId), { codesMo: maj });
  };
  const profilsMoChantier = chantier?.profilsMo || {};
  const changerProfilMo = async (cle, valeur) => {
    const maj = { ...profilsMoChantier };
    if (valeur) maj[cle] = valeur;
    else delete maj[cle];
    await updateDoc(doc(db, "sites", chantierId), { profilsMo: maj });
  };
  const profilsPossibles = CODES_TYPES_ACTIVITE_CONNUS.filter((c) => !estActiviteIgnoree(c));
  const ajouterTacheSup = async (libelle, portee) => {
    const taches = tachesMoChantier(chantier).map(({ id, libelle: l, portee: p }) => ({ id, libelle: l, portee: p }));
    taches.push({ id: nouvelIdTache(), libelle, portee });
    await updateDoc(doc(db, "sites", chantierId), { tachesMoSup: taches });
  };
  // Supprime une tâche du Bilan MO : ses heures prévues repartent en
  // « Sans tâche ». Tâche complémentaire non fixe : retirée de la liste ;
  // tâche de la minute ou du socle fixe : masquée (restaurable).
  const supprimerTacheMo = async (tacheId, ligne) => {
    const nettoyer = (obj) => {
      const out = { ...(obj || {}) };
      Object.keys(out).forEach((k) => {
        if (k.endsWith("||" + tacheId)) delete out[k];
      });
      return out;
    };
    const maj = {
      heuresMoSup: nettoyer(chantier?.heuresMoSup),
      prelevementsMoSup: nettoyer(chantier?.prelevementsMoSup),
      avancementsMoSup: nettoyer(chantier?.avancementsMoSup),
    };
    if (ligne?.sup && !ligne.fixe) {
      maj.tachesMoSup = tachesMoChantier(chantier)
        .filter((t) => t.id !== tacheId)
        .map(({ id, libelle: l, portee: p }) => ({ id, libelle: l, portee: p }));
    } else {
      const libelle = ligne?.sup ? ligne.libelle : libelleTypeFo(ligne?.cle) || ligne?.libelle || tacheId;
      maj.tachesMoMasquees = [
        ...(chantier?.tachesMoMasquees || []).filter((t) => t.id !== tacheId),
        { id: tacheId, libelle },
      ];
    }
    await updateDoc(doc(db, "sites", chantierId), maj);
  };
  const restaurerTacheMo = async (tacheId) => {
    await updateDoc(doc(db, "sites", chantierId), {
      tachesMoMasquees: (chantier?.tachesMoMasquees || []).filter((t) => t.id !== tacheId),
    });
  };
  // Bilan Achats : toujours basé sur le Type de FO (pas de distinction
  // FO/MO ici), avec le même ordre personnalisé que le Récap FO.
  const ordreTypesFoChantier = chantier?.ordreTypesFo || {};
  const achatsSynthese =
    recapActif === "achats" ? calculerAchats(lignesChantier, ordreTypesFoChantier) : [];
  const achatsParDevis =
    recapActif === "achats"
      ? devis.map((d) => ({
          devis: d,
          achats: calculerAchats(
            lignesChantier.filter((l) => l.devisId === d.id),
            ordreTypesFoChantier
          ),
        }))
      : [];

  // Affectations manuelles ligne d'achat SAP -> Type de FO de ce chantier
  // (voir rapprocherAchats) ; une valeur vide retire l'affectation et la
  // ligne retombe sur la correspondance automatique par Code SAP.
  const affectationsSap = chantier?.affectationsSapLignes || {};
  const affecterLigneSap = async (cleLigne, valeur) => {
    const maj = { ...affectationsSap };
    if (valeur) maj[cleLigne] = valeur;
    else delete maj[cleLigne];
    await updateDoc(doc(db, "sites", chantierId), { affectationsSapLignes: maj });
  };

  // Idem pour les heures pointées : ligne de pointage -> Tâche du Récap MO.
  const affectationsHeures = chantier?.affectationsSapHeures || {};
  const affecterHeureSap = async (cleLigne, valeur) => {
    const maj = { ...affectationsHeures };
    if (valeur) maj[cleLigne] = valeur;
    else delete maj[cleLigne];
    await updateDoc(doc(db, "sites", chantierId), { affectationsSapHeures: maj });
  };

  const affecterHeuresSapLot = async (cles, valeur) => {
    const maj = { ...affectationsHeures };
    cles.forEach((c) => {
      if (valeur) maj[c] = valeur;
      else delete maj[c];
    });
    await updateDoc(doc(db, "sites", chantierId), { affectationsSapHeures: maj });
  };

  // Cibles possibles d'une heure SAP : (devis, tâche), pour la synthèse
  // comme pour le tableau d'un devis.
  const optionsAffectationHeures = (devisId = null) => [
    ...recapParDevis
      .filter(({ devis: d }) => devisId === null || d.id === devisId)
      .map(({ devis: d, recap }) => ({
        devisId: d.id,
        nom: d.nom,
        taches: recap.parType.filter((t) => t.cle).map((t) => ({ cle: t.cle, libelle: t.libelle })),
      })),
    // Synthèse : tâches complémentaires « au général » (hors devis).
    ...(devisId === null
      ? [
          {
            devisId: GENERAL,
            nom: "Général",
            taches: tachesGenerales(chantier).map((t) => ({ cle: cleSup(t.id), libelle: t.libelle })),
          },
        ]
      : []),
  ];
  // Heures SAP rattachées à ce devis (tableau du devis, bilan MO).
  const sapRecapDevis = (d, recap) =>
    recapActif === "mo" && heuresSap.length > 0
      ? {
          type: "mo",
          heures: rapprocherHeures(recap.parType, heuresSap, affectationsHeures, d.id),
          affectations: affectationsHeures,
          onAffecter: peutGerer ? affecterHeureSap : null,
          onAffecterLot: peutGerer ? affecterHeuresSapLot : null,
          options: optionsAffectationHeures(d.id),
        }
      : null;

  // Réel SAP rapproché du bilan (synthèse tous devis seulement) : n'a de
  // sens que si des lignes SAP existent pour l'OTP de ce chantier.
  const sapRecap = (() => {
    if (!recapSynthese) return null;
    if (recapActif === "fo" && achatsSap.length > 0) {
      return {
        type: "fo",
        achats: rapprocherAchats(recapSynthese.parType, achatsSap, affectationsSap),
        affectations: affectationsSap,
        onAffecter: peutGerer ? affecterLigneSap : null,
      };
    }
    if (recapActif === "mo" && heuresSap.length > 0) {
      return {
        type: "mo",
        heures: rapprocherHeures(recapSynthese.parType, heuresSap, affectationsHeures),
        affectations: affectationsHeures,
        onAffecter: peutGerer ? affecterHeureSap : null,
          onAffecterLot: peutGerer ? affecterHeuresSapLot : null,
        options: optionsAffectationHeures(),
      };
    }
    return null;
  })();

  // Modifie l'ordre d'affichage personnalisé d'un type (FO ou MO, selon
  // le bilan actif) pour ce chantier — une valeur vide retire la
  // personnalisation et le type retombe sur son numéro de code.
  const modifierOrdreType = async (cle, valeur) => {
    const actuel = chantier?.[champOrdreChantier] || {};
    const maj = { ...actuel };
    const v = valeur === "" ? NaN : Number(valeur);
    if (Number.isNaN(v)) delete maj[cle];
    else maj[cle] = v;
    await updateDoc(doc(db, "sites", chantierId), { [champOrdreChantier]: maj });
  };

  // Saisie groupée : applique le même % à toutes les lignes de ce type de
  // FO — soit dans tous les devis du chantier (depuis la synthèse), soit
  // dans un seul devis (depuis son propre tableau Récap) — avec le même
  // filtre que celui utilisé pour construire le groupe (mêmes lignes
  // chiffrées, même Type de FO).
  const appliquerAvancementGroupe = async (cle, libelle, valeur, devisId) => {
    const v = Math.max(0, Math.min(100, Number(valeur) || 0));
    // Tâche complémentaire (suivi, étude…) : % saisi par devis, ou partout
    // depuis la synthèse.
    if (estCleSup(cle)) {
      const id = cle.slice(4);
      const maj = { ...(chantier?.avancementsMoSup || {}) };
      if (devisId) maj[devisId + "||" + id] = v;
      else {
        maj[GENERAL + "||" + id] = v;
        devis.forEach((d) => (maj[d.id + "||" + id] = v));
      }
      await updateDoc(doc(db, "sites", chantierId), { avancementsMoSup: maj });
      return;
    }
    const champ = champAvancementRecap;
    const lignesCible = lignesChantier.filter(
      (l) =>
        (l.typeFo || "").trim() === cle &&
        (l[champRecap] || 0) > 0 &&
        (!devisId || l.devisId === devisId)
    );
    if (lignesCible.length === 0) return;
    const nbDevisCibles = new Set(lignesCible.map((l) => l.devisId)).size;
    const portee = devisId
      ? "Cela concerne " + lignesCible.length + " ligne(s) de ce devis"
      : "Cela concerne " +
        lignesCible.length +
        " ligne(s) dans " +
        nbDevisCibles +
        " devis";
    if (
      !confirm(
        "Appliquer " +
          v +
          " % à toutes les lignes « " +
          libelle +
          " » ? " +
          portee +
          ", et écrase leur valeur actuelle."
      )
    ) {
      return;
    }
    const batch = writeBatch(db);
    lignesCible.forEach((l) => batch.update(doc(db, "elecLignes", l.id), { [champ]: v }));
    await batch.commit();
  };

  const basculerSelectionLigne = (id) => {
    setLignesSelectionnees((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  };

  // Crée un groupe à partir de la sélection courante, soit avec un nouveau
  // nom (ligneRepresentativeId = null, une ligne de tête synthétique
  // l'affichera), soit en reprenant une des lignes sélectionnées comme
  // représentante (son id est alors stocké et c'est elle qui porte le
  // bouton +/− dans le tableau). L'avancement de chaque ligne membre est
  // conservé tel quel : grouper ne le modifie jamais.
  const creerGroupe = async (nom, ligneRepresentativeId) => {
    if (!nom || !devisOuvert || lignesSelectionnees.size === 0) return;
    const refGroupe = await addDoc(collection(db, "elecGroupes"), {
      chantierId,
      devisId: devisOuvert.id,
      nom,
      ligneRepresentativeId: ligneRepresentativeId || null,
      creeLe: serverTimestamp(),
    });
    const batch = writeBatch(db);
    lignesSelectionnees.forEach((id) =>
      batch.update(doc(db, "elecLignes", id), { groupeId: refGroupe.id })
    );
    await batch.commit();
    setGroupesOuverts((prev) => new Set(prev).add(refGroupe.id));
    setLignesSelectionnees(new Set());
    setModeSelection(false);
    setAfficherGroupeModal(false);
  };

  // Applique le % saisi sur la ligne de tête d'un groupe (représentante
  // ou synthétique) à TOUTES ses lignes membres, elle y compris — c'est
  // la seule façon de faire varier l'avancement d'un groupe en une seule
  // saisie ; chaque ligne reste ensuite modifiable individuellement.
  const appliquerAvancementGroupeTete = async (groupe, champPct, valeur) => {
    const v = Math.max(0, Math.min(100, Number(valeur) || 0));
    const membres = toutesLignes.filter((l) => l.groupeId === groupe.id);
    const batch = writeBatch(db);
    membres.forEach((l) => batch.update(doc(db, "elecLignes", l.id), { [champPct]: v }));
    await batch.commit();
  };

  const dissoudreGroupe = async (groupe) => {
    if (
      !confirm(
        "Dissoudre le groupe « " +
          groupe.nom +
          " » ? Ses lignes repassent en gestion individuelle (leur avancement actuel est conservé)."
      )
    )
      return;
    const membres = toutesLignes.filter((l) => l.groupeId === groupe.id);
    const batch = writeBatch(db);
    membres.forEach((l) => batch.update(doc(db, "elecLignes", l.id), { groupeId: null }));
    batch.delete(doc(db, "elecGroupes", groupe.id));
    await batch.commit();
    setGroupesOuverts((prev) => {
      const suivant = new Set(prev);
      suivant.delete(groupe.id);
      return suivant;
    });
  };

  if (!chantier) {
    return <div className="page-loading">Chargement…</div>;
  }

  return (
    <div className="page" ref={pageRef}>
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
        <div className="header-actions-row">
          {devis.length > 0 && peutGerer && (
            <button
              className="btn-ghost"
              onClick={() => setAfficherEnvoiGoat("fourniture")}
              title="Écrit les fournitures (code/libellé SAP, budget matériel) dans la table Fourniture de la base GOAT"
            >
              <IconeAccess /> Fournitures vers GOAT
            </button>
          )}
          {devis.length > 0 && peutGerer && (
            <button
              className="btn-ghost"
              onClick={() => setAfficherEnvoiGoat("mo")}
              title="Écrit la main d'œuvre (poste, libellé, heures prévues) dans la table MainOeuvre de la base GOAT"
            >
              <IconeAccess /> Main d'œuvre vers GOAT
            </button>
          )}
          {peutGerer && (
            <>
              <button className="btn-ghost" onClick={() => setAfficherFormulaire(true)}>
                Modifier le chantier
              </button>
              <button className="btn-primary" onClick={() => setAfficherImport(true)}>
                Importer / mettre à jour une minute
              </button>
            </>
          )}
        </div>
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
              className={!recapActif ? "btn-primary" : "btn-ghost"}
              onClick={() => setRecapActif(null)}
              title="Avancement ligne par ligne, devis par devis"
            >
              📈 Suivi d'avancement
            </button>
            <button
              className={recapActif === "fo" ? "btn-primary" : "btn-ghost"}
              onClick={() => setRecapActif("fo")}
            >
              📦 Bilan Fournitures
            </button>
            <button
              className={recapActif === "mo" ? "btn-primary" : "btn-ghost"}
              onClick={() => setRecapActif("mo")}
            >
              👷 Bilan Main d'œuvre
            </button>
            <button
              className={recapActif === "achats" ? "btn-primary" : "btn-ghost"}
              onClick={() => setRecapActif("achats")}
            >
              💰 Bilan Achats
            </button>
            <button
              className={recapActif === "finance" ? "btn-primary" : "btn-ghost"}
              onClick={() => setRecapActif("finance")}
              title="Budget, réel et atterrissage en euros (taux horaires par type d'activité)"
            >
              💶 Bilan financier
            </button>
            {(achatsSap.length > 0 || heuresSap.length > 0) && (
              <button
                className={recapActif === "sap" ? "btn-primary" : "btn-ghost"}
                onClick={() => setRecapActif("sap")}
              >
                <IconeSap /> SAP
              </button>
            )}
          </div>

          {!recapActif && (
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
                  setModeSelection(false);
                  setLignesSelectionnees(new Set());
                }}
              >
                {d.nom}
              </button>
            ))}
          </div>
          )}
        </div>

          {recapActif === "achats" && (
            <>
              <TableauAchats
                titre="💰 Bilan Achats"
                sousTitre="synthèse tous devis"
                achats={achatsSynthese}
              />
              {achatsParDevis.map(({ devis: d, achats }) => (
                <TableauAchats
                  key={d.id}
                  titre="💰 Bilan Achats"
                  sousTitre={"devis " + d.nom}
                  achats={achats}
                />
              ))}
            </>
          )}

          {recapActif === "finance" &&
            (() => {
              const totFo = calculerRecap(lignesChantier, "coutTotalFo", "avancementFo", {}).total;
              const recapMoSynthese = construireRecapMo(
                calculerRecap(lignesChantier, "tempsTotalHeures", "avancementMo", {}),
                chantier,
                GENERAL,
                devis
              );
              const totMo = recapMoSynthese.total;
              const tauxDefautMo = totalTauxDefaut(chantier, tauxHoraire);
              const budgetMoEuro = recapMoSynthese.parType.reduce((sm, l) => {
                const profil = l.cle ? profilsMoChantier[l.sup ? l.cle : codeTypeFo(l.cle)] : "";
                const t = profil ? tauxHoraire(profil) ?? tauxDefautMo : tauxDefautMo;
                return sm + (l.budget || 0) * t;
              }, 0);
              return (
                <BilanFinancier
                  budgetMoEuro={budgetMoEuro}
                  caCalcule={lignesChantier
                    .filter((l) => !estLigneSomme(l))
                    .reduce((s, l) => s + (l.pvLigne || l.pvTotal || 0), 0)}
                  caSaisi={chantier?.caHt ?? null}
                  caNonSoumis={chantier?.caNonSoumisFg ?? 0}
                  onChangerCa={
                    peutGerer
                      ? (champ, v) => updateDoc(doc(db, "sites", chantierId), { [champ]: v })
                      : null
                  }
                  foa={paramsFoa}
                  pctSaisis={chantier?.foaPct || {}}
                  onChangerPct={
                    peutGerer
                      ? (cle, v) =>
                          updateDoc(doc(db, "sites", chantierId), {
                            foaPct: { ...(chantier?.foaPct || {}), [cle]: v },
                          })
                      : null
                  }
                  budgetFo={totFo.budget}
                  pctFo={totFo.pctAvancement}
                  budgetHeures={totMo.budget}
                  pctMo={totMo.pctAvancement}
                  achats={achatsSap}
                  heures={heuresSap}
                  taux={tauxHoraire}
                  tauxChiffrage={chantier?.tauxChiffrageMo ?? null}
                  tauxChiffrageDefaut={tauxHoraire("I205")}
                  onTauxChiffrage={
                    peutGerer
                      ? (v) => updateDoc(doc(db, "sites", chantierId), { tauxChiffrageMo: v })
                      : null
                  }
                />
              );
            })()}

          {recapActif === "sap" && (
            <PanneauSap
              otp={otpSap}
              achats={achatsSap}
              heures={heuresSap}
              onEnvoyerTaches={peutGerer ? () => setAfficherEnvoiSap(true) : null}
            />
          )}

    {(recapActif === "fo" || recapActif === "mo") && (
            <>
              <TableauRecap
                titre={titreRecap}
                sousTitre="synthèse tous devis"
                recap={recapSynthese}
                uniteValeur={uniteRecap}
                libelleValeur={libelleValeurRecap}
                modifiable={peutGerer}
                onModifierGroupe={appliquerAvancementGroupe}
                largeurColType={largeurColType}
                portee="chantier"
                ordreTypes={ordreTypesChantier}
                onModifierOrdre={peutGerer ? modifierOrdreType : null}
                sap={sapRecap}
                codesMo={avecSup ? codesMoChantier : null}
                onChangerCodeMo={avecSup && peutGerer ? changerCodeMo : null}
                profilsMo={avecSup ? profilsMoChantier : null}
                onChangerProfilMo={avecSup && peutGerer ? changerProfilMo : null}
                profilsPossibles={profilsPossibles}
                sup={
                  avecSup && peutGerer
                    ? {
                        portee: GENERAL,
                        onChangerHeures: changerHeuresSup,
                        onChangerPrelevement: changerPrelevementSup,
                        disponible: disponibleSansTache,
                        onAjouter: ajouterTacheSup,
                        onSupprimer: supprimerTacheMo,
                        masquees: chantier?.tachesMoMasquees || [],
                        onRestaurer: restaurerTacheMo,
                      }
                    : null
                }
              />
              {recapParDevis.map(({ devis: d, recap }) => (
                <TableauRecap
                  key={d.id}
                  titre={titreRecap}
                  sousTitre={"devis " + d.nom}
                  recap={recap}
                  uniteValeur={uniteRecap}
                  libelleValeur={libelleValeurRecap}
                  largeurColType={largeurColType}
                  modifiable={peutGerer}
                  onModifierGroupe={appliquerAvancementGroupe}
                  portee="devis"
                  devisId={d.id}
                  ordreTypes={ordreTypesChantier}
                  onModifierOrdre={peutGerer ? modifierOrdreType : null}
                  sap={sapRecapDevis(d, recap)}
                  codesMo={avecSup ? codesMoChantier : null}
                  onChangerCodeMo={avecSup && peutGerer ? changerCodeMo : null}
                profilsMo={avecSup ? profilsMoChantier : null}
                onChangerProfilMo={avecSup && peutGerer ? changerProfilMo : null}
                profilsPossibles={profilsPossibles}
                  sup={
                    avecSup && peutGerer
                      ? {
                          portee: d.id,
                          onChangerHeures: changerHeuresSup,
                          onChangerPrelevement: changerPrelevementSup,
                          disponible: disponibleSansTache,
                          onAjouter: ajouterTacheSup,
                          onSupprimer: supprimerTacheMo,
                        masquees: chantier?.tachesMoMasquees || [],
                        onRestaurer: restaurerTacheMo,
                        }
                      : null
                  }
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
                      {formatEuro(synthese.realiseMateriel)} € / {formatEuro(synthese.budgetMateriel)} €
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

              {peutGerer && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={"btn-ghost" + (modeSelection ? " btn-espace-actif" : "")}
                    onClick={() => {
                      setModeSelection((v) => !v);
                      setLignesSelectionnees(new Set());
                    }}
                  >
                    {modeSelection ? "Annuler la sélection" : "Sélectionner des lignes"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setAfficherTaches(true)}>
                    ⚙ Types de FO / tâches
                  </button>
                  {modeSelection && (
                    <>
                      <span className="simple-list-meta">
                        {lignesSelectionnees.size} ligne(s) sélectionnée(s) — cochez le N° des
                        lignes à grouper
                      </span>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={lignesSelectionnees.size === 0}
                        onClick={() => setAfficherGroupeModal(true)}
                      >
                        Grouper la sélection
                      </button>
                    </>
                  )}
                  {groupesDuDevis.length > 0 && !modeSelection && (
                    <span className="simple-list-meta">
                      {groupesDuDevis.length} groupe(s) de lignes dans ce devis — repliable(s)
                      avec le bouton + sur la ligne de tête.
                    </span>
                  )}
                </div>
              )}

              <div className="data-table-wrapper elec-lignes-wrapper">
                <table className="data-table elec-lignes-table" style={{ width: largeurTableLignes }}>
                  <colgroup>
                    <col style={{ width: LARGEUR_DESIGNATION }} />
                    <col style={{ width: LARGEUR_UNITE }} />
                    <col style={{ width: LARGEUR_QTE }} />
                    {largeursColonnesMateriel.map((l, i) => (
                      <col key={"mat-" + i} style={{ width: l }} />
                    ))}
                    {largeursColonnesMo.map((l, i) => (
                      <col key={"mo-" + i} style={{ width: l }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="elec-entete-groupes">
                      <th
                        colSpan={3}
                        className="elec-th-figee"
                        style={{
                          left: 0,
                          width: LARGEUR_ENTETE_FIGEE,
                        }}
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
                      <th
                        className="elec-col-materiel elec-col-saisie"
                        style={{ width: LARGEURS_COLONNES_MATERIEL_FIXES[0] }}
                      >
                        % avanc. FO
                      </th>
                      <th className="elec-col-materiel" style={{ width: LARGEURS_COLONNES_MATERIEL_FIXES[1] }}>
                        Coût unit.
                      </th>
                      <th className="elec-col-materiel" style={{ width: largeurTypeLigne }}>
                        FO
                      </th>
                      <th className="elec-col-materiel" style={{ width: LARGEURS_COLONNES_MATERIEL_FIXES[2] }}>
                        Coût total FO
                      </th>
                      <th className="elec-col-materiel" style={{ width: LARGEURS_COLONNES_MATERIEL_FIXES[3] }}>
                        Matériel avanc.
                      </th>
                      <th
                        className="elec-col-mo elec-col-saisie"
                        style={{ width: LARGEURS_COLONNES_MO_FIXES[0] }}
                      >
                        % avanc. MO
                      </th>
                      <th className="elec-col-mo" style={{ width: LARGEURS_COLONNES_MO_FIXES[1] }}>
                        Temps unit.
                      </th>
                      <th className="elec-col-mo" style={{ width: largeurTypeLigne }}>
                        MO
                      </th>
                      <th className="elec-col-mo" style={{ width: LARGEURS_COLONNES_MO_FIXES[2] }}>
                        Temps total
                      </th>
                      <th className="elec-col-mo" style={{ width: LARGEURS_COLONNES_MO_FIXES[3] }}>
                        Heure avanc.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesAffichees.map((item) => {
                      if (item.kind === "poste") {
                        const l = item.ligne;
                        return (
                          <tr key={l.id} className="elec-ligne-poste">
                            <td colSpan={13} style={{ paddingLeft: 8 + (l.profondeur || 0) * 16 }}>
                              {l.code ? l.code + " — " : ""}
                              {l.designation}
                            </td>
                          </tr>
                        );
                      }
                      if (item.kind === "entete") {
                        const { groupe, ouvert, membres } = item;
                        const somme = (champValeur) =>
                          membres.reduce((s, l) => s + (l[champValeur] || 0), 0);
                        return (
                          <GroupeEnteteRow
                            key={"groupe-" + groupe.id}
                            groupe={groupe}
                            ouvert={ouvert}
                            nbMembres={membres.length}
                            moyenneFo={moyennePondereeMembres(membres, "coutTotalFo", "avancementFo")}
                            moyenneMo={moyennePondereeMembres(membres, "tempsTotalHeures", "avancementMo")}
                            sommeCoutTotalFo={somme("coutTotalFo")}
                            sommeTempsTotalHeures={somme("tempsTotalHeures")}
                            peutGerer={peutGerer}
                            onToggle={() => basculerGroupeOuvert(groupe.id)}
                            onDissoudre={() => dissoudreGroupe(groupe)}
                            onChangerAvancementGroupe={(champ, valeur) =>
                              appliquerAvancementGroupeTete(groupe, champ, valeur)
                            }
                          />
                        );
                      }
                      // "representative", "membre" ou "normal" : une ligne
                      // réelle du devis, éventuellement tête de groupe
                      // (entete) ou imbriquée (membre).
                      const l = item.ligne;
                      return (
                        <LigneDevisRow
                          key={l.id}
                          ligne={l}
                          peutGerer={peutGerer}
                          modeSelection={modeSelection}
                          selectionnee={lignesSelectionnees.has(l.id)}
                          onBasculerSelection={() => basculerSelectionLigne(l.id)}
                          onChangerAvancement={(champ, valeur) => changerAvancement(l, champ, valeur)}
                          onChangerType={(champ, valeur) => changerType(l, champ, valeur)}
                          tachesFo={tachesFo}
                          imbriquee={item.kind === "membre"}
                          entete={
                            item.kind === "representative"
                              ? {
                                  ouvert: item.ouvert,
                                  onToggle: () => basculerGroupeOuvert(item.groupe.id),
                                  onDissoudre: () => dissoudreGroupe(item.groupe),
                                  onChangerAvancementGroupe: (champ, valeur) =>
                                    appliquerAvancementGroupeTete(item.groupe, champ, valeur),
                                  moyenneFo: moyennePondereeMembres(
                                    item.membres,
                                    "coutTotalFo",
                                    "avancementFo"
                                  ),
                                  moyenneMo: moyennePondereeMembres(
                                    item.membres,
                                    "tempsTotalHeures",
                                    "avancementMo"
                                  ),
                                  sommeCoutTotalFo: item.membres.reduce(
                                    (s, m) => s + (m.coutTotalFo || 0),
                                    0
                                  ),
                                  sommeTempsTotalHeures: item.membres.reduce(
                                    (s, m) => s + (m.tempsTotalHeures || 0),
                                    0
                                  ),
                                }
                              : null
                          }
                        />
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
          devisExistants={devis}
          toutesLignes={toutesLignes}
          onClose={() => setAfficherImport(false)}
        />
      )}

      {afficherEnvoiGoat && (
        <EnvoyerFournituresGoatModal
          chantierId={chantierId}
          chantier={chantier}
          mode={afficherEnvoiGoat}
          lignes={afficherEnvoiGoat === "mo" ? lignesMainOeuvreGoat(construireRecapMo(calculerRecap(lignesChantier, "tempsTotalHeures", "avancementMo", ordreTypesChantier), chantier, GENERAL, devis), chantier?.codesMo || {}) : lignesFournitureGoat(lignesChantier)}
          onClose={() => setAfficherEnvoiGoat(null)}
        />
      )}

      {afficherEnvoiSap && (
        <EnvoyerTachesSapModal
          compte={otpSap}
          taches={tachesUtilisees}
          onClose={() => setAfficherEnvoiSap(false)}
        />
      )}

      {afficherTaches && (
        <GererTachesModal
          chantierId={chantierId}
          chantier={chantier}
          taches={tachesFo}
          lignesChantier={lignesChantier}
          onClose={() => setAfficherTaches(false)}
        />
      )}

      {afficherGroupeModal && (
        <GroupeLignesModal
          lignesSelection={lignes.filter((l) => lignesSelectionnees.has(l.id))}
          onConfirmer={creerGroupe}
          onClose={() => setAfficherGroupeModal(false)}
        />
      )}
    </div>
  );
}
