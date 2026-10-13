import { Fragment, useMemo, useState } from "react";
import {
  libelleTypeActivite,
  estLigneMoIgnoree,
  estActiviteIgnoree,
  normaliserTypeActivite,
} from "../lib/typesActiviteSap";
import {
  useTauxHoraires,
  enregistrerTaux,
  useParametresFoa,
  enregistrerParametreFoa,
  PARAMS_FOA_DEFAUT,
  ZONES_DEFAUT,
  useMontantsZone,
  enregistrerMontantZone,
} from "../lib/tauxHoraires";
import { lireTexteSap } from "../lib/lireTexteSap";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import { analyserSapFo, analyserSapMo } from "../lib/parseSapExports";
import ScriptsSapPanel from "../components/ScriptsSapPanel";

// Import brut des exports texte SAP (achats "Fourniture" et pointages
// CATS "Main d'œuvre"), tous chantiers confondus. Première étape avant
// analyse : on stocke fidèlement chaque ligne telle que lue dans le
// fichier (voir lib/parseSapExports.js), sans essayer de la rapprocher
// d'un chantier précis de l'appli — ce rapprochement (via le code OTP)
// viendra dans un second temps, une fois qu'on aura vu les données en
// base. Une ligne de ces deux fichiers = un document Firestore dans
// "sapLignesFo" ou "sapLignesMo", rattaché à un import ("sapImports")
// qu'on peut annuler entièrement si besoin.
const TYPES = {
  fo: {
    titre: "Achats (Fourniture)",
    description:
      "Export SAP « Edition de liste dynamique » des achats, une ligne par ligne de commande (colonnes Elt d'OTP, GrOr = Code SAP, Val. nette…).",
    analyser: analyserSapFo,
    collectionLignes: "sapLignesFo",
    champsApercu: ["otp", "dateDoc", "grOr", "designation", "valNette"],
  },
  mo: {
    titre: "Pointages (Main d'œuvre)",
    description:
      "Export CATS des heures pointées, une ligne par personne/jour (colonnes Imputation, Nb d'heures, Designation Imputation…).",
    analyser: analyserSapMo,
    collectionLignes: "sapLignesMo",
    champsApercu: ["otp", "date", "nomPrenom", "heures", "designationImputation"],
  },
};

function BlocImport({ type, config }) {
  const [nomFichier, setNomFichier] = useState("");
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState("");
  const [enLecture, setEnLecture] = useState(false);
  const [enImport, setEnImport] = useState(false);

  const handleFichier = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur("");
    setEnLecture(true);
    setNomFichier(fichier.name);
    try {
      const texte = await lireTexteSap(fichier);
      const resultat = config.analyser(texte);
      if (resultat.length === 0) {
        setErreur("Aucune ligne de données reconnue dans ce fichier — c'est bien le bon export ?");
        setLignes(null);
      } else {
        setLignes(resultat);
      }
    } catch (err) {
      setErreur("Impossible de lire ce fichier : " + err.message);
      setLignes(null);
    } finally {
      setEnLecture(false);
    }
  };

  const importer = async () => {
    if (!lignes) return;
    setEnImport(true);
    try {
      const importRef = await addDoc(collection(db, "sapImports"), {
        type,
        nomFichier,
        nbLignes: lignes.length,
        creeLe: serverTimestamp(),
      });
      const TAILLE_LOT = 400;
      for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
        const batch = writeBatch(db);
        for (const ligne of lignes.slice(i, i + TAILLE_LOT)) {
          const ref = doc(collection(db, config.collectionLignes));
          batch.set(ref, { ...ligne, importId: importRef.id, creeLe: serverTimestamp() });
        }
        await batch.commit();
      }
      setLignes(null);
      setNomFichier("");
    } catch (err) {
      setErreur("Erreur pendant l'import : " + err.message);
    } finally {
      setEnImport(false);
    }
  };

  return (
    <div className="panel" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>{config.titre}</h2>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>
        {config.description}
      </p>

      <label className="file-picker">
        <input type="file" accept=".txt" onChange={handleFichier} />
        <span className="file-picker-icon">⬆</span>
        <span className="file-picker-text">
          <strong>Choisir un fichier</strong>
          <span>{nomFichier || "Aucun fichier sélectionné"}</span>
        </span>
      </label>

      {enLecture && <p className="page-loading">Analyse du fichier…</p>}
      {erreur && <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>}

      {lignes && (
        <div style={{ marginTop: 16 }}>
          <p>
            <strong>{lignes.length}</strong> ligne(s) détectée(s) dans {nomFichier}.
          </p>
          <div className="hscroll-auto" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  {config.champsApercu.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.slice(0, 15).map((l, i) => (
                  <tr key={i}>
                    {config.champsApercu.map((c) => (
                      <td key={c} data-label={c}>
                        {String(l[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lignes.length > 15 && (
            <p className="empty-state-description" style={{ margin: "8px 0 0" }}>
              … et {lignes.length - 15} ligne(s) supplémentaire(s), non affichée(s) dans cet aperçu
              mais bien importée(s).
            </p>
          )}
          <button
            className="btn-primary"
            style={{ marginTop: 12 }}
            onClick={importer}
            disabled={enImport}
          >
            {enImport ? "Import…" : "Importer " + lignes.length + " ligne(s)"}
          </button>
        </div>
      )}
    </div>
  );
}

function HistoriqueImports() {
  const { documents: imports, chargement } = useCollection("sapImports");
  const [suppressionEnCours, setSuppressionEnCours] = useState(null);

  const supprimer = async (imp) => {
    if (!confirm("Annuler cet import ? Toutes ses lignes seront supprimées.")) return;
    setSuppressionEnCours(imp.id);
    const nomCollection = imp.type === "fo" ? "sapLignesFo" : "sapLignesMo";
    const snap = await getDocs(query(collection(db, nomCollection), where("importId", "==", imp.id)));
    const TAILLE_LOT = 400;
    const refs = snap.docs.map((d) => d.ref);
    for (let i = 0; i < refs.length; i += TAILLE_LOT) {
      const batch = writeBatch(db);
      refs.slice(i, i + TAILLE_LOT).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, "sapImports", imp.id));
    setSuppressionEnCours(null);
  };

  if (chargement) return null;
  if (imports.length === 0) return null;

  return (
    <div className="panel" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Imports réalisés</h2>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Fichier</th>
              <th>Type</th>
              <th>Lignes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {imports.map((imp) => (
              <tr key={imp.id}>
                <td data-label="Fichier">{imp.nomFichier}</td>
                <td data-label="Type">{imp.type === "fo" ? "Achats (Fourniture)" : "Pointages (MO)"}</td>
                <td data-label="Lignes">{imp.nbLignes}</td>
                <td>
                  <button
                    className="btn-ghost btn-danger"
                    onClick={() => supprimer(imp)}
                    disabled={suppressionEnCours === imp.id}
                  >
                    {suppressionEnCours === imp.id ? "Suppression…" : "Annuler l'import"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Colonnes affichées et champs interrogés par la recherche libre, pour
// chacune des deux collections de lignes importées.
const CONSULTATION = {
  fo: {
    collectionLignes: "sapLignesFo",
    colonnes: [
      { champ: "otp", label: "OTP" },
      { champ: "dateDoc", label: "Date" },
      { champ: "grOr", label: "Code SAP" },
      { champ: "nomFournisseur", label: "Fournisseur" },
      { champ: "designation", label: "Désignation" },
      { champ: "quantite", label: "Qté", numerique: true },
      { champ: "valNette", label: "Val. nette €", numerique: true, euro: true },
    ],
    champsRecherche: ["otp", "designation", "grOr", "nomFournisseur", "reference", "docAchat"],
    filtres: [
      { champ: "grOr", label: "Code SAP" },
      { champ: "nomFournisseur", label: "Fournisseur" },
    ],
    detail: [
      ["docAchat", "Doc. achat"],
      ["poste", "Poste"],
      ["reference", "Référence"],
      ["fournisseur", "N° fournisseur"],
      ["nomFournisseur", "Fournisseur"],
      ["designation", "Désignation"],
      ["quantite", "Quantité"],
      ["unite", "Unité"],
      ["prixNet", "Prix net"],
      ["valNette", "Val. nette €"],
      ["grOr", "Code SAP"],
      ["besoin", "Besoin"],
      ["dateDoc", "Date"],
      ["otp", "OTP"],
    ],
    champValeur: "valNette",
    labelTotal: "Val. nette totale",
    suffixeTotal: " €",
  },
  mo: {
    collectionLignes: "sapLignesMo",
    colonnes: [
      { champ: "otp", label: "OTP" },
      { champ: "date", label: "Date" },
      { champ: "nomPrenom", label: "Personne" },
      { champ: "designationImputation", label: "Chantier (désignation)" },
      { champ: "typAct", label: "Type activité" },
      { champ: "heures", label: "Heures", numerique: true },
    ],
    champsRecherche: ["otp", "nomPrenom", "designationImputation", "typAct", "matricule"],
    filtres: [
      { champ: "nomPrenom", label: "Personne" },
      { champ: "typAct", label: "Type activité", libelle: true },
      { champ: "tache", label: "Tâche" },
    ],
    detail: [
      ["date", "Date"],
      ["nomPrenom", "Personne"],
      ["matricule", "Matricule"],
      ["imputation", "Imputation"],
      ["otp", "OTP"],
      ["designationImputation", "Désignation imputation"],
      ["tache", "Tâche"],
      ["typAct", "Type activité", true],
      ["heures", "Heures"],
      ["responsable", "Responsable"],
    ],
    champValeur: "heures",
    labelTotal: "Heures totales",
    suffixeTotal: " h",
  },
};

function formatValeur(v, numerique, euro) {
  if (v === null || v === undefined || v === "") return "";
  if (!numerique) return String(v);
  const n = Number(v) || 0;
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: euro ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

// Recherche/filtre/affichage progressif pour un onglet (Fourniture ou
// Main d'œuvre) — remontée avec une clé différente par onglet (voir
// VueConsultation) pour repartir d'un état propre en changeant d'onglet,
// plutôt qu'un useEffect de réinitialisation.
// dd.mm.yyyy -> yyyymmdd (comparable) ; "" si illisible.
const cleDate = (d) => {
  const m = String(d || "").match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? m[3] + m[2] + m[1] : "";
};
const champDate = (config) => (config.collectionLignes === "sapLignesMo" ? "date" : "dateDoc");

function TableauConsultation({ config }) {
  const { documents: lignes, chargement } = useCollection(config.collectionLignes);
  const [recherche, setRecherche] = useState("");
  const [otpFiltre, setOtpFiltre] = useState("");
  const [filtres, setFiltres] = useState({});
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [tri, setTri] = useState({ champ: champDate(config), sens: -1 });
  const [ouvert, setOuvert] = useState(null);
  const [nbAffiches, setNbAffiches] = useState(50);
  const estMo = config.collectionLignes === "sapLignesMo";
  const fDate = champDate(config);

  const valeurAff = (l, champ, libelle) => (libelle ? libelleTypeActivite(l[champ]) : l[champ] ?? "");

  const otpsDisponibles = useMemo(
    () => [...new Set(lignes.map((l) => l.otp).filter(Boolean))].sort(),
    [lignes]
  );
  const baseLignes = useMemo(() => lignes.filter((l) => !(estMo && estLigneMoIgnoree(l))), [lignes, estMo]);
  const optionsFiltre = useMemo(() => {
    const o = {};
    config.filtres.forEach((f) => {
      o[f.champ] = [...new Set(baseLignes.map((l) => String(l[f.champ] ?? "")).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "fr", { numeric: true })
      );
    });
    return o;
  }, [baseLignes, config]);

  const filtrees = useMemo(() => {
    const termes = recherche.trim().toLowerCase();
    const dDu = du ? du.replaceAll("-", "") : "";
    const dAu = au ? au.replaceAll("-", "") : "";
    const res = baseLignes.filter((l) => {
      if (otpFiltre && l.otp !== otpFiltre) return false;
      for (const f of config.filtres) {
        if (filtres[f.champ] && String(l[f.champ] ?? "") !== filtres[f.champ]) return false;
      }
      if (dDu || dAu) {
        const d = cleDate(l[fDate]);
        if (!d || (dDu && d < dDu) || (dAu && d > dAu)) return false;
      }
      if (!termes) return true;
      return config.champsRecherche.some((c) => String(l[c] ?? "").toLowerCase().includes(termes));
    });
    const num = config.colonnes.find((c) => c.champ === tri.champ)?.numerique;
    return [...res].sort((x, y) => {
      let a = x[tri.champ] ?? "";
      let b = y[tri.champ] ?? "";
      if (tri.champ === fDate) {
        a = cleDate(a);
        b = cleDate(b);
      }
      if (num) return (Number(a) - Number(b)) * tri.sens;
      return String(a).localeCompare(String(b), "fr", { numeric: true }) * tri.sens;
    });
  }, [baseLignes, recherche, otpFiltre, filtres, du, au, tri, config, fDate]);

  const total = useMemo(
    () => filtrees.reduce((s, l) => s + (Number(l[config.champValeur]) || 0), 0),
    [filtrees, config]
  );

  // Récapitulatif par premier filtre (Code SAP / Personne) sur la sélection.
  const champGroupe = config.filtres[0];
  const groupes = useMemo(() => {
    const m = new Map();
    filtrees.forEach((l) => {
      const k = String(l[champGroupe.champ] ?? "") || "—";
      m.set(k, (m.get(k) || 0) + (Number(l[config.champValeur]) || 0));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtrees, champGroupe, config]);

  const reinit = () => {
    setRecherche("");
    setOtpFiltre("");
    setFiltres({});
    setDu("");
    setAu("");
    setNbAffiches(50);
  };
  const filtreActif = recherche || otpFiltre || du || au || Object.values(filtres).some(Boolean);
  const trier = (champ) => setTri((t) => (t.champ === champ ? { champ, sens: -t.sens } : { champ, sens: 1 }));
  const euroTotal = config.suffixeTotal === " €";

  return (
    <>
      {chargement ? (
        <p className="page-loading">Chargement…</p>
      ) : lignes.length === 0 ? (
        <p className="empty-state-description">Aucune ligne importée pour le moment.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            <input
              placeholder="Rechercher…"
              value={recherche}
              onChange={(e) => {
                setNbAffiches(50);
                setRecherche(e.target.value);
              }}
              style={{ minWidth: 200, flex: "1 1 200px" }}
            />
            <select value={otpFiltre} onChange={(e) => { setNbAffiches(50); setOtpFiltre(e.target.value); }}>
              <option value="">Tous les chantiers (OTP)</option>
              {otpsDisponibles.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            {config.filtres.map((f) => (
              <select
                key={f.champ}
                value={filtres[f.champ] || ""}
                onChange={(e) => { setNbAffiches(50); setFiltres((p) => ({ ...p, [f.champ]: e.target.value })); }}
              >
                <option value="">{f.label} : tous</option>
                {optionsFiltre[f.champ].map((o) => (
                  <option key={o} value={o}>{f.libelle ? libelleTypeActivite(o) : o}</option>
                ))}
              </select>
            ))}
            <label className="simple-list-meta">
              Du <input type="date" value={du} onChange={(e) => { setNbAffiches(50); setDu(e.target.value); }} />
            </label>
            <label className="simple-list-meta">
              au <input type="date" value={au} onChange={(e) => { setNbAffiches(50); setAu(e.target.value); }} />
            </label>
            {filtreActif && (
              <button className="btn-ghost" onClick={reinit}>Réinitialiser</button>
            )}
          </div>

          <p className="page-subtitle" style={{ marginBottom: 8 }}>
            {filtrees.length} ligne(s) — {config.labelTotal} :{" "}
            <strong>
              {formatValeur(total, true, euroTotal)}
              {config.suffixeTotal}
            </strong>
          </p>

          {groupes.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {groupes.slice(0, 30).map(([k, v]) => (
                <button
                  key={k}
                  className={filtres[champGroupe.champ] === k ? "btn-primary" : "btn-ghost"}
                  style={{ padding: "2px 10px", fontSize: 12 }}
                  title={"Filtrer sur " + champGroupe.label + " " + k}
                  onClick={() => {
                    setNbAffiches(50);
                    setFiltres((p) => ({ ...p, [champGroupe.champ]: p[champGroupe.champ] === k ? "" : k }));
                  }}
                >
                  {champGroupe.libelle ? libelleTypeActivite(k) : k} · {formatValeur(v, true, euroTotal)}
                  {config.suffixeTotal}
                </button>
              ))}
            </div>
          )}

          <div className="hscroll-auto" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  {config.colonnes.map((c) => (
                    <th key={c.champ} style={{ cursor: "pointer", userSelect: "none" }} onClick={() => trier(c.champ)}>
                      {c.label}
                      {tri.champ === c.champ ? (tri.sens > 0 ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrees.slice(0, nbAffiches).map((l) => (
                  <Fragment key={l.id}>
                    <tr style={{ cursor: "pointer" }} onClick={() => setOuvert(ouvert === l.id ? null : l.id)}>
                      {config.colonnes.map((c) => (
                        <td key={c.champ} data-label={c.label}>
                          {c.champ === "typAct" ? libelleTypeActivite(l.typAct) : formatValeur(l[c.champ], c.numerique, c.euro)}
                        </td>
                      ))}
                    </tr>
                    {ouvert === l.id && (
                      <tr>
                        <td colSpan={config.colonnes.length}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "6px 20px", padding: "6px 4px" }}>
                            {config.detail.map(([champ, label, lib]) => (
                              <div key={champ}>
                                <div className="simple-list-meta">{label}</div>
                                <div>{String(valeurAff(l, champ, lib)) || "—"}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {filtrees.length > nbAffiches && (
            <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setNbAffiches((n) => n + 50)}>
              Afficher plus ({filtrees.length - nbAffiches} restante(s))
            </button>
          )}
        </>
      )}
    </>
  );
}

// Vue en lecture seule des lignes déjà importées — recherche libre, filtre
// par chantier (code OTP), affichage progressif (les imports comptent
// plusieurs centaines à plusieurs milliers de lignes). Le tableau est
// remonté avec une clé différente par onglet pour repartir d'un état
// propre (recherche, filtre, pagination) en changeant d'onglet.
function VueConsultation() {
  const [onglet, setOnglet] = useState("fo");

  return (
    <div className="panel" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Consultation</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={onglet === "fo" ? "btn-primary" : "btn-ghost"}
          onClick={() => setOnglet("fo")}
        >
          Achats (Fourniture)
        </button>
        <button
          className={onglet === "mo" ? "btn-primary" : "btn-ghost"}
          onClick={() => setOnglet("mo")}
        >
          Pointages (Main d'œuvre)
        </button>
      </div>

      <TableauConsultation key={onglet} config={CONSULTATION[onglet]} />
    </div>
  );
}

// Taux horaires par type d'activité SAP (€/h) : servent au bilan financier
// des chantiers. Modifiables par un admin ; un type sans taux est en rouge.
function TauxHorairesPanel({ peutModifier }) {
  const { taux, chargement } = useTauxHoraires();
  const { documents: lignesMo } = useCollection("sapLignesMo");
  const [saisies, setSaisies] = useState({});
  const codes = useMemo(() => {
    const ens = new Set();
    lignesMo.forEach((l) => {
      const c = normaliserTypeActivite(l.typAct);
      if (c && !estActiviteIgnoree(c)) ens.add(c);
    });
    return [...ens].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  }, [lignesMo]);

  const valider = async (code) => {
    if (saisies[code] === undefined) return;
    const t = String(saisies[code]).replace(",", ".").trim();
    const n = t === "" ? null : Number(t);
    if (n !== null && !(n >= 0)) return;
    await enregistrerTaux(code, n);
    setSaisies((p) => {
      const { [code]: _omis, ...reste } = p;
      return reste;
    });
  };

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Taux horaires par type d'activité</h2>
      <p className="simple-list-meta" style={{ marginBottom: 10 }}>
        Coût horaire (€/h) de chaque type d'activité SAP, utilisé pour valoriser les heures pointées
        dans le bilan financier des chantiers.{" "}
        {peutModifier ? "Modifiable par un administrateur." : "Modification réservée aux administrateurs."}
      </p>
      {chargement ? (
        <p className="simple-list-meta">Chargement…</p>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Libellé</th>
                <th>Taux (€/h)</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const t = taux(c);
                const manquant = t === null;
                const valeur = saisies[c] !== undefined ? saisies[c] : t === null ? "" : String(t).replace(".", ",");
                return (
                  <tr key={c}>
                    <td data-label="Type">{c}</td>
                    <td data-label="Libellé">{LIBELLE_SEUL(c)}</td>
                    <td data-label="Taux (€/h)">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valeur}
                        disabled={!peutModifier}
                        placeholder={manquant ? "À renseigner" : ""}
                        onChange={(e) => setSaisies((p) => ({ ...p, [c]: e.target.value }))}
                        onBlur={() => valider(c)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        style={{
                          width: 110,
                          ...(manquant ? { borderColor: "#c0392b", background: "rgba(192,57,43,0.08)" } : {}),
                        }}
                      />
                      {manquant && <span style={{ color: "#c0392b", marginLeft: 8, fontSize: 12 }}>manquant</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
// Paramètres FOA (pourcentages) du bilan financier des chantiers.
function ParametresFoaPanel({ peutModifier }) {
  const params = useParametresFoa();
  const [saisies, setSaisies] = useState({});
  const valider = async (cle) => {
    if (saisies[cle] === undefined) return;
    const n = Number(String(saisies[cle]).replace(",", ".").trim());
    setSaisies((p) => {
      const { [cle]: _omis, ...reste } = p;
      return reste;
    });
    if (Number.isFinite(n) && n >= 0) await enregistrerParametreFoa(cle, PARAMS_FOA_DEFAUT[cle].unite ? n : n / 100);
  };
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Paramètres du bilan financier (FOA)</h2>
      <p className="simple-list-meta" style={{ marginBottom: 10 }}>
        Pourcentages de la feuille d'ouverture d'affaire, utilisés pour le calcul de la marge nette.{" "}
        {peutModifier ? "Modifiable par un administrateur." : "Modification réservée aux administrateurs."}
      </p>
      <div className="data-table-wrapper">
        <table className="data-table">
          <tbody>
            {Object.entries(PARAMS_FOA_DEFAUT).map(([cle, def]) => {
              const affiche = saisies[cle] !== undefined ? saisies[cle] : String(def.unite ? params[cle] : Math.round(params[cle] * 100000) / 1000).replace(".", ",");
              return (
                <tr key={cle}>
                  <td data-label="Paramètre">{def.label}</td>
                  <td data-label="Valeur (%)">
                    <input
                      type="text"
                      inputMode="decimal"
                      style={{ width: 90 }}
                      disabled={!peutModifier}
                      value={affiche}
                      onChange={(e) => setSaisies((p) => ({ ...p, [cle]: e.target.value }))}
                      onBlur={() => valider(cle)}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    />{" "}
                    {def.unite || "%"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Montants des zones de déplacement (€ par jour) : valorisent les pointages
// SAP J et F dans le bilan financier. Zone choisie dans la fiche chantier.
function MontantsZonePanel({ peutModifier }) {
  const montant = useMontantsZone();
  const [saisies, setSaisies] = useState({});
  const valider = async (code) => {
    if (saisies[code] === undefined) return;
    const t = String(saisies[code]).replace(",", ".").trim();
    const n = t === "" ? null : Number(t);
    setSaisies((p) => {
      const { [code]: _omis, ...reste } = p;
      return reste;
    });
    if (n === null || n >= 0) await enregistrerMontantZone(code, n);
  };
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Montants des zones de déplacement</h2>
      <p className="simple-list-meta" style={{ marginBottom: 10 }}>
        Indemnité par jour et par zone (FOA). Dans le bilan financier, les pointages SAP J et F sont valorisés
        heures × montant ÷ 7,2 h.{" "}
        {peutModifier ? "Modifiable par un administrateur." : "Modification réservée aux administrateurs."}
      </p>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Zone</th>
              <th>Montant (€/jour)</th>
            </tr>
          </thead>
          <tbody>
            {ZONES_DEFAUT.map((z) => {
              const m = montant(z.code);
              const manquant = m === null;
              return (
                <tr key={z.code}>
                  <td data-label="Zone">{z.label}</td>
                  <td data-label="Montant (€/jour)">
                    <input
                      type="text"
                      inputMode="decimal"
                      style={{ width: 110, ...(manquant ? { borderColor: "#c0392b", background: "rgba(192,57,43,0.08)" } : {}) }}
                      disabled={!peutModifier}
                      placeholder={manquant ? "À renseigner" : ""}
                      value={saisies[z.code] !== undefined ? saisies[z.code] : m === null ? "" : String(m).replace(".", ",")}
                      onChange={(e) => setSaisies((p) => ({ ...p, [z.code]: e.target.value }))}
                      onBlur={() => valider(z.code)}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const LIBELLE_SEUL = (c) => libelleTypeActivite(c).replace(/ \([^)]*\)$/, "").replace(c, "");

const ONGLETS = [
  { id: "import", label: "📥 Import" },
  { id: "consultation", label: "🔎 Consultation" },
  { id: "taux", label: "💶 Taux horaires" },
  { id: "foa", label: "📐 Paramètres FOA" },
  { id: "zones", label: "🚐 Zones" },
];

export default function ElectriciteImportSap() {
  const { isAdmin, profile } = useAuth();
  const [onglet, setOnglet] = useState("import");
  const peutGerer = isAdmin || profile?.role === "ra_electricite";

  if (!peutGerer) {
    return (
      <div className="page">
        <div className="empty-state">
          <p className="empty-state-title">Accès réservé</p>
          <p className="empty-state-description">
            Cette page n'est accessible qu'aux responsables Électricité.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Import SAP</h1>
          <p className="page-subtitle">
            Importe les exports SAP (achats et pointages) tels quels, pour analyse ultérieure.
            Le rapprochement avec vos chantiers se fera dans un second temps.
          </p>
        </div>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {ONGLETS.map((o) => (
          <button key={o.id} className={onglet === o.id ? "btn-primary" : "btn-ghost"} onClick={() => setOnglet(o.id)}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="page-sections" style={{ display: "grid", gap: 20 }}>
        {onglet === "import" && (
          <ScriptsSapPanel
            importManuel={
              <>
                <BlocImport type="fo" config={TYPES.fo} />
                <BlocImport type="mo" config={TYPES.mo} />
              </>
            }
            historique={<HistoriqueImports />}
          />
        )}
        {onglet === "consultation" && <VueConsultation />}
        {onglet === "taux" && <TauxHorairesPanel peutModifier={Boolean(isAdmin)} />}
        {onglet === "foa" && <ParametresFoaPanel peutModifier={Boolean(isAdmin)} />}
        {onglet === "zones" && <MontantsZonePanel peutModifier={Boolean(isAdmin)} />}
      </div>
    </div>
  );
}
