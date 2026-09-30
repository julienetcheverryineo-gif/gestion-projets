import { useCallback, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, updateDoc, query, collection, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import SiteFormModal, { formatStatutChantier } from "../components/SiteFormModal";
import ImportMinuteElectriciteModal from "../components/ImportMinuteElectriciteModal";
import { LISTE_TYPES_FO, LISTE_TYPES_MO, valeurType } from "../lib/typesElectricite";

// Largeurs des 2 colonnes d'identification figées (gel de volets, comme
// dans Excel) : n°, Désignation restent visibles quand on défile vers
// les colonnes Matériel / Main d'œuvre, très nombreuses. (La colonne
// Référence n'est pas affichée — elle ne sert pas sur ce projet — mais
// reste importée et stockée, affichée en infobulle sur la désignation.)
const LARGEUR_NUMERO = 22;
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
const LARGEUR_COL_NUM = 170;
const LARGEUR_COL_AVANCEMENT = 240;
const LARGEUR_MIN_COL_TYPE = 200;
const SOMME_LARGEURS_RECAP_FIXES = LARGEUR_COL_NUM * 3 + LARGEUR_COL_AVANCEMENT;

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
      cle: g.cle,
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

function TableauRecap({
  titre,
  sousTitre,
  recap,
  uniteValeur,
  libelleValeur,
  modifiable,
  onModifierGroupe,
  largeurColType,
  portee,
  devisId,
}) {
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
          Modifiez un % ici pour l'appliquer d'un coup à toutes les lignes de ce type de FO
          {portee === "devis" ? ", dans ce devis." : ", dans tous les devis du chantier."}
        </p>
      )}
      {recap.parType.length === 0 ? (
        <p className="simple-list-meta">Aucune donnée chiffrée pour ce périmètre.</p>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table table-recap">
            <thead>
              <tr>
                <th className="col-type" style={{ width: largeurColType }}>
                  Type de FO
                </th>
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
                    {modifiable ? (
                      <LigneAvancementModifiable
                        pct={l.pctAvancement}
                        onValider={(v) => onModifierGroupe(l.cle, l.libelle, v, devisId)}
                      />
                    ) : (
                      <LigneAvancementBarre pct={l.pctAvancement} />
                    )}
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

// Saisie groupée depuis la synthèse : modifier ce % applique la même
// valeur à toutes les lignes de ce type de FO, tous devis confondus
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

  const devis = tousDevis
    .filter((d) => d.chantierId === chantierId)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

  const [devisOuvertId, setDevisOuvertId] = useState(null);
  const devisOuvert = devis.find((d) => d.id === devisOuvertId) ?? devis[0] ?? null;

  // "fo" / "mo" : un récapitulatif chantier (tous devis + détail par
  // devis) est affiché à la place du devis ouvert. null = vue normale.
  // Par défaut "fo" : à l'ouverture d'un chantier, on arrive directement
  // sur la synthèse Fournitures plutôt que sur un devis.
  const [recapActif, setRecapActif] = useState("fo");

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

  // Change le type de FO ou de MO d'une ligne (menu déroulant).
  const changerType = async (ligne, champ, valeur) => {
    await updateDoc(doc(db, "elecLignes", ligne.id), { [champ]: valeur });
  };

  // Arrondi à 2 décimales (quantités, coûts, temps) — évite d'accumuler
  // des décimales flottantes à chaque recalcul en chaîne.
  const arrondi2 = (n) => Math.round((n || 0) * 100) / 100;

  // Qté, PU et PT (coût ou temps) sont liés : Qté × PU = PT. Modifier l'un
  // des trois recalcule automatiquement les deux autres pour les garder
  // cohérents, aussi bien côté Matériel (coûts) que côté Main d'œuvre
  // (temps) — la quantité est commune aux deux.
  const modifierValeurLigne = async (ligne, champ, valeurBrute) => {
    const valeur = Math.max(0, Number(String(valeurBrute).replace(",", ".")) || 0);
    const maj = {};
    if (champ === "quantite") {
      maj.quantite = valeur;
      maj.coutTotalFo = arrondi2(valeur * (ligne.coutUnitaireFo || 0));
      maj.tempsTotalHeures = arrondi2(valeur * (ligne.tempsUnitaire || 0));
    } else if (champ === "coutUnitaireFo") {
      const q = ligne.quantite || 0;
      maj.coutUnitaireFo = valeur;
      maj.coutTotalFo = arrondi2(q * valeur);
    } else if (champ === "coutTotalFo") {
      const q = ligne.quantite || 0;
      maj.coutTotalFo = valeur;
      maj.coutUnitaireFo = q > 0 ? arrondi2(valeur / q) : ligne.coutUnitaireFo || 0;
    } else if (champ === "tempsUnitaire") {
      const q = ligne.quantite || 0;
      maj.tempsUnitaire = valeur;
      maj.tempsTotalHeures = arrondi2(q * valeur);
    } else if (champ === "tempsTotalHeures") {
      const q = ligne.quantite || 0;
      maj.tempsTotalHeures = valeur;
      maj.tempsUnitaire = q > 0 ? arrondi2(valeur / q) : ligne.tempsUnitaire || 0;
    }
    await updateDoc(doc(db, "elecLignes", ligne.id), maj);
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

  // Saisie groupée : applique le même % à toutes les lignes de ce type de
  // FO — soit dans tous les devis du chantier (depuis la synthèse), soit
  // dans un seul devis (depuis son propre tableau Récap) — avec le même
  // filtre que celui utilisé pour construire le groupe (mêmes lignes
  // chiffrées, même Type de FO).
  const appliquerAvancementGroupe = async (cle, libelle, valeur, devisId) => {
    const v = Math.max(0, Math.min(100, Number(valeur) || 0));
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
              📦 Bilan Fournitures
            </button>
            <button
              className={recapActif === "mo" ? "btn-primary" : "btn-ghost"}
              onClick={() => setRecapActif(recapActif === "mo" ? null : "mo")}
            >
              👷 Bilan Main d'œuvre
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
                modifiable={peutGerer}
                onModifierGroupe={appliquerAvancementGroupe}
                largeurColType={largeurColType}
                portee="chantier"
              />
              {recapParDevis.map(({ devis: d, recap }) => (
                <TableauRecap
                  key={d.id}
                  titre={recapActif === "mo" ? "Récap Avancement MO" : "Récap Avancement FO"}
                  sousTitre={"devis " + d.nom}
                  recap={recap}
                  uniteValeur={uniteRecap}
                  libelleValeur={libelleValeurRecap}
                  largeurColType={largeurColType}
                  modifiable={peutGerer}
                  onModifierGroupe={appliquerAvancementGroupe}
                  portee="devis"
                  devisId={d.id}
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
                <table className="data-table elec-lignes-table" style={{ width: largeurTableLignes }}>
                  <colgroup>
                    <col style={{ width: LARGEUR_NUMERO }} />
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
                        colSpan={4}
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
                            <div className="elec-valeur-input">
                              <input
                                key={l.quantite}
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={l.quantite || 0}
                                disabled={!peutGerer}
                                onBlur={(e) => modifierValeurLigne(l, "quantite", e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                              />
                            </div>
                          </td>
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
                                  onBlur={(e) => changerAvancement(l, "avancementFo", e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                  }}
                                />
                                <span>%</span>
                              </div>
                            )}
                          </td>
                          <td className="elec-col-materiel">
                            <div className="elec-valeur-input">
                              <input
                                key={l.coutUnitaireFo}
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={l.coutUnitaireFo || 0}
                                disabled={!peutGerer}
                                onBlur={(e) => modifierValeurLigne(l, "coutUnitaireFo", e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                              />
                              <span>€</span>
                            </div>
                          </td>
                          <td className="elec-col-materiel elec-type-code">
                            <select
                              className="elec-type-select"
                              title={formatTypeFo(l.typeFo)}
                              value={l.typeFo || ""}
                              disabled={!peutGerer}
                              onChange={(e) => changerType(l, "typeFo", e.target.value)}
                            >
                              <option value="">—</option>
                              {l.typeFo &&
                                !LISTE_TYPES_FO.some(
                                  (o) => valeurType(o.code, o.label) === l.typeFo
                                ) && <option value={l.typeFo}>{formatTypeFo(l.typeFo)}</option>}
                              {LISTE_TYPES_FO.map((o) => (
                                <option key={o.code} value={valeurType(o.code, o.label)}>
                                  {o.code} · {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="elec-col-materiel">
                            <div className="elec-valeur-input">
                              <input
                                key={l.coutTotalFo}
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={l.coutTotalFo || 0}
                                disabled={!peutGerer}
                                onBlur={(e) => modifierValeurLigne(l, "coutTotalFo", e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                              />
                              <span>€</span>
                            </div>
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
                                  key={pctMo}
                                  type="number"
                                  min="0"
                                  max="100"
                                  defaultValue={pctMo}
                                  disabled={!peutGerer}
                                  onBlur={(e) => changerAvancement(l, "avancementMo", e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                  }}
                                />
                                <span>%</span>
                              </div>
                            )}
                          </td>
                          <td className="elec-col-mo">
                            <div className="elec-valeur-input">
                              <input
                                key={l.tempsUnitaire}
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={l.tempsUnitaire || 0}
                                disabled={!peutGerer}
                                onBlur={(e) => modifierValeurLigne(l, "tempsUnitaire", e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                              />
                              <span>h</span>
                            </div>
                          </td>
                          <td className="elec-col-mo elec-type-code">
                            <select
                              className="elec-type-select"
                              title={formatTypeFo(l.typeMo)}
                              value={l.typeMo || ""}
                              disabled={!peutGerer}
                              onChange={(e) => changerType(l, "typeMo", e.target.value)}
                            >
                              <option value="">—</option>
                              {l.typeMo &&
                                !LISTE_TYPES_MO.some(
                                  (o) => valeurType(o.code, o.label) === l.typeMo
                                ) && <option value={l.typeMo}>{formatTypeFo(l.typeMo)}</option>}
                              {LISTE_TYPES_MO.map((o) => (
                                <option key={o.code} value={valeurType(o.code, o.label)}>
                                  {o.code} · {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="elec-col-mo">
                            <div className="elec-valeur-input">
                              <input
                                key={l.tempsTotalHeures}
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={l.tempsTotalHeures || 0}
                                disabled={!peutGerer}
                                onBlur={(e) => modifierValeurLigne(l, "tempsTotalHeures", e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                              />
                              <span>h</span>
                            </div>
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
