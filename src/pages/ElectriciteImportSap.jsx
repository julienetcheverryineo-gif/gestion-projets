import { useMemo, useState } from "react";
import { libelleTypeActivite, estActiviteIgnoree } from "../lib/typesActiviteSap";
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
function TableauConsultation({ config }) {
  const { documents: lignes, chargement } = useCollection(config.collectionLignes);
  const [recherche, setRecherche] = useState("");
  const [otpFiltre, setOtpFiltre] = useState("");
  const [nbAffiches, setNbAffiches] = useState(50);

  const otpsDisponibles = useMemo(
    () => [...new Set(lignes.map((l) => l.otp).filter(Boolean))].sort(),
    [lignes]
  );

  const filtrees = useMemo(() => {
    const termes = recherche.trim().toLowerCase();
    return lignes.filter((l) => {
      if (config.collectionLignes === "sapLignesMo" && estActiviteIgnoree(l.typAct)) return false;
      if (otpFiltre && l.otp !== otpFiltre) return false;
      if (!termes) return true;
      return config.champsRecherche.some((c) => String(l[c] ?? "").toLowerCase().includes(termes));
    });
  }, [lignes, recherche, otpFiltre, config]);

  const total = useMemo(
    () => filtrees.reduce((s, l) => s + (Number(l[config.champValeur]) || 0), 0),
    [filtrees, config]
  );

  return (
    <>
      {chargement ? (
        <p className="page-loading">Chargement…</p>
      ) : lignes.length === 0 ? (
        <p className="empty-state-description">Aucune ligne importée pour le moment.</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              placeholder="Rechercher…"
              value={recherche}
              onChange={(e) => {
                setNbAffiches(50);
                setRecherche(e.target.value);
              }}
              style={{ minWidth: 220, flex: "1 1 220px" }}
            />
            <select
              value={otpFiltre}
              onChange={(e) => {
                setNbAffiches(50);
                setOtpFiltre(e.target.value);
              }}
            >
              <option value="">Tous les chantiers (OTP)</option>
              {otpsDisponibles.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <p className="page-subtitle" style={{ marginBottom: 8 }}>
            {filtrees.length} ligne(s) — {config.labelTotal} :{" "}
            <strong>
              {formatValeur(total, true, config.suffixeTotal === " €")}
              {config.suffixeTotal}
            </strong>
          </p>

          <div className="hscroll-auto" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  {config.colonnes.map((c) => (
                    <th key={c.champ}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrees.slice(0, nbAffiches).map((l) => (
                  <tr key={l.id}>
                    {config.colonnes.map((c) => (
                      <td key={c.champ} data-label={c.label}>
                        {c.champ === "typAct" ? libelleTypeActivite(l.typAct) : formatValeur(l[c.champ], c.numerique, c.euro)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtrees.length > nbAffiches && (
            <button
              className="btn-ghost"
              style={{ marginTop: 12 }}
              onClick={() => setNbAffiches((n) => n + 50)}
            >
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

export default function ElectriciteImportSap() {
  const { isAdmin, profile } = useAuth();
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

      <div className="page-sections" style={{ display: "grid", gap: 20 }}>
        <ScriptsSapPanel
          importManuel={
            <>
              <BlocImport type="fo" config={TYPES.fo} />
              <BlocImport type="mo" config={TYPES.mo} />
            </>
          }
          historique={<HistoriqueImports />}
        />
        <VueConsultation />
      </div>
    </div>
  );
}
