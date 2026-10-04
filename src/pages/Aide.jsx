import { useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import mammoth from "mammoth";
import { db, storage } from "../firebase";
import { useCollection } from "../lib/firestoreHooks";

// Page "Aide" côté Automatisme & GTB : pensée pour accueillir plusieurs
// fiches de référence au fil du temps (onglets), alimentées et mises à
// jour par l'équipe elle-même plutôt que figées dans le code — on
// commence avec les tables d'échange Modbus des compteurs Socomec,
// d'autres onglets viendront s'ajouter au même endroit.
const ONGLETS = [
  { cle: "modbus-socomec", label: "📋 Table échange modbus" },
  { cle: "procedures", label: "📘 Procédures" },
];

const TYPES_REGISTRE = ["uint16", "int16", "uint32", "int32", "float32", "bool", "string", "autre"];
const ACCES_REGISTRE = [
  { value: "lecture", label: "Lecture" },
  { value: "ecriture", label: "Écriture" },
  { value: "lecture_ecriture", label: "Lecture/Écriture" },
];
function formatAcces(v) {
  return ACCES_REGISTRE.find((a) => a.value === v)?.label ?? v;
}

// Découpe une recherche en plusieurs termes séparés par un espace ou un
// point-virgule (ex. "puissance;tension" ou "puissance tension"), pour
// filtrer sur plusieurs mots à la fois : une ligne correspond si au moins
// un des termes est trouvé dans l'un des champs fournis.
function correspondARecherche(recherche, champs) {
  const termes = recherche
    .trim()
    .toLowerCase()
    .split(/[\s;]+/)
    .filter(Boolean);
  if (termes.length === 0) return true;
  const valeurs = champs.map((c) => String(c ?? "").toLowerCase());
  return termes.some((t) => valeurs.some((v) => v.includes(t)));
}

// Colonnes triables du tableau de registres Modbus. L'adresse (ex.
// "0106-0107") est comparée numériquement sur sa partie hexadécimale de
// départ ; les autres colonnes sont comparées comme du texte.
const COLONNES_TRIABLES_REGISTRE = [
  { champ: "adresse", label: "Adresse" },
  { champ: "designation", label: "Désignation" },
  { champ: "type", label: "Type" },
  { champ: "unite", label: "Unité" },
  { champ: "acces", label: "Accès" },
  { champ: "commentaire", label: "Commentaire" },
];

function valeurTriRegistre(registre, champ) {
  if (champ === "adresse") {
    const debut = String(registre.adresse || "").split("-")[0];
    const n = parseInt(debut, 16);
    return Number.isNaN(n) ? -1 : n;
  }
  if (champ === "acces") return formatAcces(registre.acces) || "";
  return String(registre[champ] ?? "");
}

function trierRegistres(liste, triChamp, triSens) {
  if (!triChamp) return liste;
  const copie = [...liste];
  copie.sort((a, b) => {
    const va = valeurTriRegistre(a, triChamp);
    const vb = valeurTriRegistre(b, triChamp);
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "fr", { numeric: true });
    return triSens === "desc" ? -cmp : cmp;
  });
  return copie;
}

function EnteteTriable({ champ, label, triChamp, triSens, onTrier }) {
  const actif = triChamp === champ;
  return (
    <th>
      <button
        type="button"
        className="th-tri-btn"
        onClick={() => onTrier(champ)}
        title={"Trier par " + label.toLowerCase()}
      >
        {label} {actif ? (triSens === "desc" ? "▾" : "▴") : ""}
      </button>
    </th>
  );
}

function CompteurFormModal({ compteur, onClose }) {
  const [nom, setNom] = useState(compteur?.nom ?? "");
  const [commentaire, setCommentaire] = useState(compteur?.commentaire ?? "");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nom.trim()) return;
    setEnCours(true);
    const donnees = { nom: nom.trim(), commentaire: commentaire.trim() };
    if (compteur) {
      await updateDoc(doc(db, "modbusCompteurs", compteur.id), donnees);
    } else {
      await addDoc(collection(db, "modbusCompteurs"), { ...donnees, creeLe: serverTimestamp() });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{compteur ? "Modifier le produit" : "Nouveau produit"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Modèle
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex : Diris A40"
              required
            />
          </label>
          <label>
            Commentaire / source
            <textarea
              rows={3}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="ex : lien vers la doc PDF officielle, version du firmware, notes…"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RegistreFormModal({ compteurId, registre, nbExistants, onClose }) {
  const [adresse, setAdresse] = useState(registre?.adresse ?? "");
  const [designation, setDesignation] = useState(registre?.designation ?? "");
  const [type, setType] = useState(registre?.type ?? "uint16");
  const [unite, setUnite] = useState(registre?.unite ?? "");
  const [acces, setAcces] = useState(registre?.acces ?? "lecture");
  const [commentaire, setCommentaire] = useState(registre?.commentaire ?? "");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!adresse.trim() || !designation.trim()) return;
    setEnCours(true);
    const donnees = {
      adresse: adresse.trim(),
      designation: designation.trim(),
      type,
      unite: unite.trim(),
      acces,
      commentaire: commentaire.trim(),
    };
    if (registre) {
      await updateDoc(doc(db, "modbusRegistres", registre.id), donnees);
    } else {
      await addDoc(collection(db, "modbusRegistres"), {
        ...donnees,
        compteurId,
        ordre: nbExistants,
        creeLe: serverTimestamp(),
      });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{registre ? "Modifier le registre" : "Nouveau registre"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-inline">
            <label>
              Adresse
              <input
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="ex : 0x0000 ou 1"
                required
              />
            </label>
            <label>
              Type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES_REGISTRE.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Désignation
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="ex : Puissance active totale"
              required
            />
          </label>
          <div className="form-inline">
            <label>
              Unité
              <input value={unite} onChange={(e) => setUnite(e.target.value)} placeholder="ex : W" />
            </label>
            <label>
              Accès
              <select value={acces} onChange={(e) => setAcces(e.target.value)}>
                {ACCES_REGISTRE.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Commentaire
            <input
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="ex : facteur d'échelle ×0,1"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Import rapide de plusieurs registres d'un coup en collant un tableau
// (copié depuis Excel ou extrait d'un PDF) — la saisie ligne par ligne via
// RegistreFormModal reste possible, mais fastidieuse pour une table de
// plusieurs dizaines de registres.
function ImportCollerModal({ compteurId, nbExistants, onClose }) {
  const [texte, setTexte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const lignes = texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\t|;/).map((c) => c.trim()))
    .filter((champs) => champs.length >= 2)
    .map((champs) => ({
      adresse: champs[0] || "",
      designation: champs[1] || "",
      type: (champs[2] || "uint16").toLowerCase(),
      unite: champs[3] || "",
      acces: champs[4] || "lecture",
      commentaire: champs[5] || "",
    }));

  const importer = async () => {
    if (lignes.length === 0) return;
    setEnCours(true);
    setErreur("");
    try {
      // Un writeBatch Firestore est limité à 500 écritures : pour les
      // tables les plus volumineuses (ex. Countis ECI2/ECI3, ~900
      // registres), on découpe en plusieurs lots séquentiels.
      const TAILLE_LOT = 450;
      for (let depart = 0; depart < lignes.length; depart += TAILLE_LOT) {
        const lot = lignes.slice(depart, depart + TAILLE_LOT);
        const batch = writeBatch(db);
        lot.forEach((l, i) => {
          const ref = doc(collection(db, "modbusRegistres"));
          batch.set(ref, {
            ...l,
            compteurId,
            ordre: nbExistants + depart + i,
            creeLe: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      onClose();
    } catch (err) {
      setErreur("Erreur pendant l'import : " + err.message);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="import-popup" onClick={(e) => e.stopPropagation()}>
        <header className="import-fullscreen-header">
          <div>
            <h2>Coller un tableau de registres</h2>
            <p className="page-subtitle">
              Une ligne par registre, colonnes séparées par une tabulation (collé depuis Excel) ou un
              point-virgule : Adresse, Désignation, Type, Unité, Accès, Commentaire (les 4 dernières
              colonnes sont facultatives).
            </p>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Fermer">
            Fermer ✕
          </button>
        </header>
        <div className="import-fullscreen-body">
          <textarea
            rows={10}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={"0x0000\tPuissance active totale\tint32\tW\tlecture\n0x0002\tTension V1\tuint16\tV\tlecture"}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
          {lignes.length > 0 && (
            <>
              <p style={{ marginTop: 12 }}>
                <strong>{lignes.length}</strong> registre(s) détecté(s).
              </p>
              <div className="hscroll-auto" style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Adresse</th>
                      <th>Désignation</th>
                      <th>Type</th>
                      <th>Unité</th>
                      <th>Accès</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.slice(0, 15).map((l, i) => (
                      <tr key={i}>
                        <td data-label="Adresse">{l.adresse}</td>
                        <td data-label="Désignation">{l.designation}</td>
                        <td data-label="Type">{l.type}</td>
                        <td data-label="Unité">{l.unite}</td>
                        <td data-label="Accès">{formatAcces(l.acces)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lignes.length > 15 && (
                <p className="empty-state-description" style={{ margin: "8px 0 0" }}>
                  … et {lignes.length - 15} ligne(s) supplémentaire(s).
                </p>
              )}
            </>
          )}
          {erreur && <div className="form-error" style={{ marginTop: 10 }}>{erreur}</div>}
        </div>
        <footer className="import-fullscreen-footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn-primary"
            onClick={importer}
            disabled={enCours || lignes.length === 0}
          >
            {enCours ? "Import…" : "Importer " + lignes.length + " registre(s)"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CompteursModbusTab() {
  const { documents: compteursBruts, chargement: chargementCompteurs } =
    useCollection("modbusCompteurs");
  const { documents: registresBruts, chargement: chargementRegistres } =
    useCollection("modbusRegistres");
  const compteurs = [...compteursBruts].sort((a, b) =>
    (a.nom || "").localeCompare(b.nom || "", "fr", { numeric: true })
  );

  const [compteurSelectionneId, setCompteurSelectionneId] = useState(null);
  const [afficherFormCompteur, setAfficherFormCompteur] = useState(false);
  const [compteurEnEdition, setCompteurEnEdition] = useState(null);
  const [afficherFormRegistre, setAfficherFormRegistre] = useState(false);
  const [registreEnEdition, setRegistreEnEdition] = useState(null);
  const [afficherImport, setAfficherImport] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(null);
  const [rechercheProduit, setRechercheProduit] = useState("");

  const compteurSelectionne =
    compteurs.find((c) => c.id === compteurSelectionneId) ?? compteurs[0] ?? null;

  const compteursFiltres = compteurs.filter((c) =>
    correspondARecherche(rechercheProduit, [c.nom])
  );

  const [rechercheRegistre, setRechercheRegistre] = useState("");
  const [nbAffiches, setNbAffiches] = useState(50);
  const [triChamp, setTriChamp] = useState(null);
  const [triSens, setTriSens] = useState("asc");

  const trier = (champ) => {
    setNbAffiches(50);
    if (triChamp === champ) {
      setTriSens((s) => (s === "asc" ? "desc" : "asc"));
    } else {
      setTriChamp(champ);
      setTriSens("asc");
    }
  };

  const registres = compteurSelectionne
    ? registresBruts
        .filter((r) => r.compteurId === compteurSelectionne.id)
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    : [];

  const registresFiltres = trierRegistres(
    registres.filter((r) =>
      correspondARecherche(rechercheRegistre, [
        r.adresse,
        r.designation,
        r.type,
        r.unite,
        r.commentaire,
      ])
    ),
    triChamp,
    triSens
  );

  const supprimerCompteur = async (compteur) => {
    if (
      !confirm(
        "Supprimer le produit « " + compteur.nom + " » ? Tous ses registres seront aussi supprimés."
      )
    )
      return;
    setSuppressionEnCours(compteur.id);
    const snap = await getDocs(
      query(collection(db, "modbusRegistres"), where("compteurId", "==", compteur.id))
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, "modbusCompteurs", compteur.id));
    await batch.commit();
    setSuppressionEnCours(null);
    if (compteurSelectionneId === compteur.id) setCompteurSelectionneId(null);
  };

  const supprimerRegistre = async (registre) => {
    if (!confirm("Supprimer ce registre ?")) return;
    await deleteDoc(doc(db, "modbusRegistres", registre.id));
  };

  if (chargementCompteurs || chargementRegistres) {
    return <p className="page-loading">Chargement…</p>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20 }}>
      <div className="panel" style={{ padding: 16, alignSelf: "start" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Produits</h3>
          <button
            className="btn-ghost"
            onClick={() => {
              setCompteurEnEdition(null);
              setAfficherFormCompteur(true);
            }}
          >
            + Nouveau
          </button>
        </div>
        {compteurs.length === 0 ? (
          <p className="empty-state-description" style={{ margin: 0 }}>
            Aucun produit pour l'instant. Ajoutez-en un pour commencer à renseigner sa table
            Modbus.
          </p>
        ) : (
          <>
            <input
              placeholder="Rechercher un produit…"
              value={rechercheProduit}
              onChange={(e) => setRechercheProduit(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            />
            {compteursFiltres.length === 0 ? (
              <p className="empty-state-description" style={{ margin: 0 }}>
                Aucun produit ne correspond.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {compteursFiltres.map((c) => (
                  <button
                    key={c.id}
                    className={
                      "btn-ghost" +
                      (compteurSelectionne?.id === c.id ? " btn-espace-actif" : "")
                    }
                    style={{ justifyContent: "flex-start", textAlign: "left" }}
                    onClick={() => {
                      setCompteurSelectionneId(c.id);
                      setRechercheRegistre("");
                      setNbAffiches(50);
                      setTriChamp(null);
                      setTriSens("asc");
                    }}
                  >
                    {c.nom}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        {!compteurSelectionne ? (
          <div className="empty-state">
            <p className="empty-state-title">Aucun produit sélectionné</p>
            <p className="empty-state-description">
              Choisissez un produit dans la liste, ou ajoutez-en un nouveau.
            </p>
          </div>
        ) : (
          <div className="panel" style={{ padding: 20 }}>
            <div className="panel-header" style={{ alignItems: "flex-start" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{compteurSelectionne.nom}</h2>
                {compteurSelectionne.commentaire && (
                  <p className="page-subtitle" style={{ whiteSpace: "pre-wrap" }}>
                    {compteurSelectionne.commentaire}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setCompteurEnEdition(compteurSelectionne);
                    setAfficherFormCompteur(true);
                  }}
                >
                  Modifier
                </button>
                <button
                  className="btn-ghost btn-danger"
                  onClick={() => supprimerCompteur(compteurSelectionne)}
                  disabled={suppressionEnCours === compteurSelectionne.id}
                >
                  {suppressionEnCours === compteurSelectionne.id
                    ? "Suppression…"
                    : "Supprimer le produit"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, margin: "12px 0 16px" }}>
              <button
                className="btn-primary"
                onClick={() => {
                  setRegistreEnEdition(null);
                  setAfficherFormRegistre(true);
                }}
              >
                + Ajouter un registre
              </button>
              <button className="btn-ghost" onClick={() => setAfficherImport(true)}>
                📋 Coller un tableau
              </button>
            </div>

            {registres.length === 0 ? (
              <p className="empty-state-description">
                Aucun registre renseigné pour ce produit pour l'instant.
              </p>
            ) : (
              <>
                <input
                  placeholder="Rechercher (ex. puissance tension, ou puissance;tension)"
                  value={rechercheRegistre}
                  onChange={(e) => {
                    setNbAffiches(50);
                    setRechercheRegistre(e.target.value);
                  }}
                  style={{ width: "100%", marginBottom: 10 }}
                />
                <p className="page-subtitle" style={{ marginBottom: 8 }}>
                  {registresFiltres.length} registre(s)
                </p>
                {registresFiltres.length === 0 ? (
                  <p className="empty-state-description">Aucun registre ne correspond.</p>
                ) : (
                  <div className="data-table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {COLONNES_TRIABLES_REGISTRE.map((c) => (
                            <EnteteTriable
                              key={c.champ}
                              champ={c.champ}
                              label={c.label}
                              triChamp={triChamp}
                              triSens={triSens}
                              onTrier={trier}
                            />
                          ))}
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {registresFiltres.slice(0, nbAffiches).map((r) => (
                          <tr key={r.id}>
                            <td data-label="Adresse">{r.adresse}</td>
                            <td data-label="Désignation">{r.designation}</td>
                            <td data-label="Type">{r.type}</td>
                            <td data-label="Unité">{r.unite || "—"}</td>
                            <td data-label="Accès">{formatAcces(r.acces)}</td>
                            <td data-label="Commentaire">{r.commentaire || "—"}</td>
                            <td>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button
                                  className="btn-ghost"
                                  onClick={() => {
                                    setRegistreEnEdition(r);
                                    setAfficherFormRegistre(true);
                                  }}
                                >
                                  Modifier
                                </button>
                                <button className="btn-ghost btn-danger" onClick={() => supprimerRegistre(r)}>
                                  Supprimer
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {registresFiltres.length > nbAffiches && (
                  <button
                    className="btn-ghost"
                    style={{ marginTop: 12 }}
                    onClick={() => setNbAffiches((n) => n + 50)}
                  >
                    Afficher plus ({registresFiltres.length - nbAffiches} restante(s))
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {afficherFormCompteur && (
        <CompteurFormModal
          compteur={compteurEnEdition}
          onClose={() => setAfficherFormCompteur(false)}
        />
      )}
      {afficherFormRegistre && compteurSelectionne && (
        <RegistreFormModal
          compteurId={compteurSelectionne.id}
          registre={registreEnEdition}
          nbExistants={registres.length}
          onClose={() => setAfficherFormRegistre(false)}
        />
      )}
      {afficherImport && compteurSelectionne && (
        <ImportCollerModal
          compteurId={compteurSelectionne.id}
          nbExistants={registres.length}
          onClose={() => setAfficherImport(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Onglet "Procédures" : fiches de procédure importées depuis un document
// (ex. Word) et structurées en titres/paragraphes, avec un menu qui
// reprend la table des matières du document pour naviguer dedans.
// Même esprit que l'onglet Modbus : une collection "procedures" (une
// fiche = un document importé) et une collection "procedureBlocs" (le
// contenu, dans l'ordre), pour pouvoir en ajouter d'autres facilement
// depuis l'application au fil du temps.
// ---------------------------------------------------------------------

const TYPES_BLOC = [
  { value: "titre1", label: "Titre principal" },
  { value: "titre2", label: "Sous-titre" },
  { value: "titre3", label: "Sous-sous-titre" },
  { value: "paragraphe", label: "Paragraphe" },
  { value: "liste", label: "Élément de liste" },
  { value: "image", label: "Image (URL)" },
];
const NIVEAUX_TITRE = { titre1: 1, titre2: 2, titre3: 3 };

function ProcedureFormModal({ procedure, onClose }) {
  const [titre, setTitre] = useState(procedure?.titre ?? "");
  const [commentaire, setCommentaire] = useState(procedure?.commentaire ?? "");
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnCours(true);
    const donnees = { titre, commentaire };
    if (procedure) {
      await updateDoc(doc(db, "procedures", procedure.id), donnees);
    } else {
      await addDoc(collection(db, "procedures"), { ...donnees, creeLe: serverTimestamp() });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{procedure ? "Modifier la procédure" : "Nouvelle procédure"}</h2>
        <form onSubmit={enregistrer} className="form">
          <label>
            Titre
            <input value={titre} onChange={(e) => setTitre(e.target.value)} required />
          </label>
          <label>
            Commentaire (optionnel)
            <textarea
              rows={3}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BlocFormModal({ procedureId, bloc, nbExistants, onClose }) {
  const [type, setType] = useState(bloc?.type ?? "paragraphe");
  const [texte, setTexte] = useState(bloc?.texte ?? "");
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnCours(true);
    if (bloc) {
      await updateDoc(doc(db, "procedureBlocs", bloc.id), { type, texte });
    } else {
      await addDoc(collection(db, "procedureBlocs"), {
        procedureId,
        type,
        texte,
        ordre: nbExistants,
        creeLe: serverTimestamp(),
      });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{bloc ? "Modifier le bloc" : "Ajouter un bloc"}</h2>
        <form onSubmit={enregistrer} className="form">
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES_BLOC.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Texte
            <textarea rows={5} value={texte} onChange={(e) => setTexte(e.target.value)} required />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Import d'un document entier en une fois, en collant un texte structuré
// avec une syntaxe légère façon Markdown :
//   # Titre principal     → titre1
//   ## Sous-titre         → titre2
//   ### Sous-sous-titre   → titre3
//   - élément de liste    → liste
//   texte normal          → paragraphe
// Ce même format peut être régénéré pour importer d'autres documents à
// l'avenir (export du document source vers ce format, comme pour les
// tables Modbus collées depuis un tableur).
function ImportDocumentModal({ procedureId, nbExistants, onClose }) {
  const [texte, setTexte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const blocs = texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      if (l.startsWith("### ")) return { type: "titre3", texte: l.slice(4).trim() };
      if (l.startsWith("## ")) return { type: "titre2", texte: l.slice(3).trim() };
      if (l.startsWith("# ")) return { type: "titre1", texte: l.slice(2).trim() };
      if (l.startsWith("- ")) return { type: "liste", texte: l.slice(2).trim() };
      return { type: "paragraphe", texte: l };
    })
    .filter((b) => b.texte);

  const importer = async () => {
    if (blocs.length === 0) return;
    setEnCours(true);
    setErreur("");
    try {
      // Même précaution que pour l'import de registres Modbus : un
      // writeBatch Firestore est limité à 500 écritures.
      const TAILLE_LOT = 450;
      for (let depart = 0; depart < blocs.length; depart += TAILLE_LOT) {
        const lot = blocs.slice(depart, depart + TAILLE_LOT);
        const batch = writeBatch(db);
        lot.forEach((b, i) => {
          const ref = doc(collection(db, "procedureBlocs"));
          batch.set(ref, {
            ...b,
            procedureId,
            ordre: nbExistants + depart + i,
            creeLe: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      onClose();
    } catch (err) {
      setErreur("Erreur pendant l'import : " + err.message);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="import-popup" onClick={(e) => e.stopPropagation()}>
        <h2>Coller un document</h2>
        <p className="empty-state-description" style={{ margin: "0 0 10px" }}>
          Collez le contenu structuré avec <code># Titre</code>, <code>## Sous-titre</code>,{" "}
          <code>### Sous-sous-titre</code>, <code>- élément de liste</code>, le reste étant
          considéré comme un paragraphe normal.
        </p>
        <textarea
          rows={14}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={"# PC\n## Excel\n### Ranger un tableau\nTexte du paragraphe…"}
          style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}
        />
        <p className="page-subtitle" style={{ margin: "8px 0" }}>
          {blocs.length} bloc(s) détecté(s)
        </p>
        {erreur && <div className="form-error">{erreur}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={enCours || blocs.length === 0}
            onClick={importer}
          >
            {enCours ? "Import…" : "Importer " + blocs.length + " bloc(s)"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Un sommaire Word natif (champ "Table des matières") est rendu par
// mammoth comme de simples paragraphes "Titre<tab>12" (titre + tabulation
// + numéro de page) : on les détecte à ce motif pour ne pas les importer
// en double avec le sommaire généré par l'application elle-même à partir
// des titres (voir tableDesMatieres).
const RE_ENTREE_SOMMAIRE_WORD = /\t\s*\d+$/;

function nettoyerTexte(texte) {
  return texte.replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
}

// Convertit le HTML produit par mammoth (titres, paragraphes, listes,
// images) en blocs prêts à enregistrer. Mammoth reconnaît automatiquement
// les styles Word "Heading 1/2/3" (→ h1/h2/h3) et les listes à puces/
// numérotées (→ ul/ol + li) ; ce qu'il ne reconnaît pas reste du texte
// normal, donc rien n'est perdu.
function convertirHtmlEnBlocs(html) {
  const document_ = new DOMParser().parseFromString(html, "text/html");
  const blocs = [];
  for (const el of document_.body.children) {
    const tag = el.tagName;
    if (tag === "H1") {
      blocs.push({ type: "titre1", texte: nettoyerTexte(el.textContent) });
    } else if (tag === "H2") {
      blocs.push({ type: "titre2", texte: nettoyerTexte(el.textContent) });
    } else if (tag === "H3" || tag === "H4" || tag === "H5" || tag === "H6") {
      blocs.push({ type: "titre3", texte: nettoyerTexte(el.textContent) });
    } else if (tag === "UL" || tag === "OL") {
      for (const li of el.children) {
        if (li.tagName === "LI" && li.textContent.trim()) {
          blocs.push({ type: "liste", texte: nettoyerTexte(li.textContent) });
        }
      }
    } else if (tag === "P") {
      const texteBrut = el.textContent.trim();
      const img = el.querySelector("img");
      if (img && !texteBrut) {
        blocs.push({ type: "image", texte: img.getAttribute("src") });
      } else if (texteBrut && !RE_ENTREE_SOMMAIRE_WORD.test(texteBrut)) {
        blocs.push({ type: "paragraphe", texte: nettoyerTexte(texteBrut) });
      }
    }
  }
  return blocs.filter((b) => b.texte);
}

// Transforme les octets d'une image embarquée dans le .docx (lus par
// mammoth) en fichier dans Firebase Storage, et renvoie son URL de
// téléchargement pour l'<img> généré. Nécessite que les règles Storage
// (storage.rules) aient été déployées — sinon l'import échoue avec une
// erreur de permission, récupérée par ImportWordModal.
function convertisseurImages(procedureId) {
  return mammoth.images.imgElement(async (image) => {
    const base64 = await image.read("base64");
    const octets = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const extension = (image.contentType || "image/png").split("/")[1] || "png";
    const nomFichier =
      Date.now() + "-" + Math.random().toString(36).slice(2) + "." + extension;
    const reference = ref(storage, "procedures/" + procedureId + "/images/" + nomFichier);
    await uploadBytes(reference, octets, { contentType: image.contentType });
    const url = await getDownloadURL(reference);
    return { src: url };
  });
}

// Import direct d'un fichier Word (.docx) : conversion en HTML via
// mammoth (dans le navigateur, sans passer par un serveur), upload des
// images vers Firebase Storage, puis enregistrement des blocs obtenus.
// Alternative à "Coller un document" quand on a le fichier source sous la
// main plutôt qu'un texte déjà préparé.
function ImportWordModal({ procedureId, nbExistants, onClose }) {
  const [nomFichier, setNomFichier] = useState("");
  const [blocs, setBlocs] = useState([]);
  const [messagesAvertissement, setMessagesAvertissement] = useState([]);
  const [analyseEnCours, setAnalyseEnCours] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const choisirFichier = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setNomFichier(fichier.name);
    setBlocs([]);
    setMessagesAvertissement([]);
    setErreur("");
    setAnalyseEnCours(true);
    try {
      const arrayBuffer = await fichier.arrayBuffer();
      const resultat = await mammoth.convertToHtml(
        { arrayBuffer },
        { convertImage: convertisseurImages(procedureId) }
      );
      setBlocs(convertirHtmlEnBlocs(resultat.value));
      setMessagesAvertissement((resultat.messages || []).map((m) => m.message));
    } catch (err) {
      setErreur("Erreur pendant l'analyse du fichier : " + err.message);
    } finally {
      setAnalyseEnCours(false);
    }
  };

  const importer = async () => {
    if (blocs.length === 0) return;
    setEnCours(true);
    setErreur("");
    try {
      const TAILLE_LOT = 450;
      for (let depart = 0; depart < blocs.length; depart += TAILLE_LOT) {
        const lot = blocs.slice(depart, depart + TAILLE_LOT);
        const batch = writeBatch(db);
        lot.forEach((b, i) => {
          const refDoc = doc(collection(db, "procedureBlocs"));
          batch.set(refDoc, {
            ...b,
            procedureId,
            ordre: nbExistants + depart + i,
            creeLe: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      onClose();
    } catch (err) {
      setErreur(
        "Erreur pendant l'import : " +
          err.message +
          (err.code === "storage/unauthorized"
            ? " — les règles Firebase Storage (storage.rules) doivent être déployées."
            : "")
      );
    } finally {
      setEnCours(false);
    }
  };

  const nbImages = blocs.filter((b) => b.type === "image").length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="import-popup" onClick={(e) => e.stopPropagation()}>
        <h2>Importer un fichier Word (.docx)</h2>
        <p className="empty-state-description" style={{ margin: "0 0 10px" }}>
          Les titres (styles « Titre 1/2/3 »), paragraphes, listes à puces et images du document
          sont importés automatiquement, avec la même structure que dans Word.
        </p>
        <input type="file" accept=".docx" onChange={choisirFichier} />
        {analyseEnCours && <p className="page-loading">Analyse du document…</p>}
        {!analyseEnCours && nomFichier && blocs.length > 0 && (
          <p className="page-subtitle" style={{ margin: "10px 0" }}>
            {nomFichier} : {blocs.length} bloc(s) détecté(s), dont {nbImages} image(s).
          </p>
        )}
        {messagesAvertissement.length > 0 && (
          <details style={{ margin: "6px 0" }}>
            <summary className="simple-list-meta" style={{ cursor: "pointer" }}>
              {messagesAvertissement.length} information(s) de conversion
            </summary>
            <ul style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {messagesAvertissement.slice(0, 20).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </details>
        )}
        {erreur && <div className="form-error">{erreur}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={enCours || analyseEnCours || blocs.length === 0}
            onClick={importer}
          >
            {enCours ? "Import…" : "Importer " + blocs.length + " bloc(s)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function tableDesMatieres(blocs) {
  return blocs
    .filter((b) => NIVEAUX_TITRE[b.type])
    .map((b) => ({ id: b.id, niveau: NIVEAUX_TITRE[b.type], texte: b.texte }));
}

function BlocContenu({ bloc, onModifier, onSupprimer }) {
  const contenu = (
    <div className="procedure-bloc-actions">
      <button type="button" className="btn-ghost" onClick={onModifier}>
        Modifier
      </button>
      <button type="button" className="btn-ghost btn-danger" onClick={onSupprimer}>
        Supprimer
      </button>
    </div>
  );

  if (bloc.type === "titre1") {
    return (
      <div id={"bloc-" + bloc.id} className="procedure-bloc procedure-titre1">
        <h2>{bloc.texte}</h2>
        {contenu}
      </div>
    );
  }
  if (bloc.type === "titre2") {
    return (
      <div id={"bloc-" + bloc.id} className="procedure-bloc procedure-titre2">
        <h3>{bloc.texte}</h3>
        {contenu}
      </div>
    );
  }
  if (bloc.type === "titre3") {
    return (
      <div id={"bloc-" + bloc.id} className="procedure-bloc procedure-titre3">
        <h4>{bloc.texte}</h4>
        {contenu}
      </div>
    );
  }
  if (bloc.type === "liste") {
    return (
      <div className="procedure-bloc procedure-liste">
        <li>{bloc.texte}</li>
        {contenu}
      </div>
    );
  }
  if (bloc.type === "image") {
    return (
      <div className="procedure-bloc procedure-image">
        <img src={bloc.texte} alt="" loading="lazy" />
        {contenu}
      </div>
    );
  }
  return (
    <div className="procedure-bloc procedure-paragraphe">
      <p>{bloc.texte}</p>
      {contenu}
    </div>
  );
}

function ProceduresTab() {
  const { documents: proceduresBrutes, chargement: chargementProcedures } =
    useCollection("procedures");
  const { documents: blocsBruts, chargement: chargementBlocs } = useCollection("procedureBlocs");
  const procedures = [...proceduresBrutes].sort((a, b) =>
    (a.titre || "").localeCompare(b.titre || "", "fr", { numeric: true })
  );

  const [procedureSelectionneeId, setProcedureSelectionneeId] = useState(null);
  const [afficherFormProcedure, setAfficherFormProcedure] = useState(false);
  const [procedureEnEdition, setProcedureEnEdition] = useState(null);
  const [afficherFormBloc, setAfficherFormBloc] = useState(false);
  const [blocEnEdition, setBlocEnEdition] = useState(null);
  const [afficherImport, setAfficherImport] = useState(false);
  const [afficherImportWord, setAfficherImportWord] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(null);
  const [rechercheProcedure, setRechercheProcedure] = useState("");

  const procedureSelectionnee =
    procedures.find((p) => p.id === procedureSelectionneeId) ?? procedures[0] ?? null;

  const proceduresFiltrees = procedures.filter((p) =>
    correspondARecherche(rechercheProcedure, [p.titre])
  );

  const blocs = procedureSelectionnee
    ? blocsBruts
        .filter((b) => b.procedureId === procedureSelectionnee.id)
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    : [];
  const sommaire = tableDesMatieres(blocs);

  const supprimerProcedure = async (procedure) => {
    if (
      !confirm(
        "Supprimer la procédure « " + procedure.titre + " » ? Tout son contenu sera aussi supprimé."
      )
    )
      return;
    setSuppressionEnCours(procedure.id);
    const snap = await getDocs(
      query(collection(db, "procedureBlocs"), where("procedureId", "==", procedure.id))
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, "procedures", procedure.id));
    await batch.commit();
    setSuppressionEnCours(null);
    if (procedureSelectionneeId === procedure.id) setProcedureSelectionneeId(null);
  };

  const supprimerBloc = async (bloc) => {
    if (!confirm("Supprimer ce bloc ?")) return;
    await deleteDoc(doc(db, "procedureBlocs", bloc.id));
  };

  const allerAuBloc = (blocId) => {
    const el = document.getElementById("bloc-" + blocId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (chargementProcedures || chargementBlocs) {
    return <p className="page-loading">Chargement…</p>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20 }}>
      <div className="panel" style={{ padding: 16, alignSelf: "start" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
          <h3 style={{ margin: 0 }}>Procédures</h3>
          <button
            className="btn-ghost"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => {
              setProcedureEnEdition(null);
              setAfficherFormProcedure(true);
            }}
          >
            + Nouvelle
          </button>
        </div>
        {procedures.length === 0 ? (
          <p className="empty-state-description" style={{ margin: 0 }}>
            Aucune procédure pour l'instant. Créez-en une, puis collez-y un document.
          </p>
        ) : (
          <>
            <input
              placeholder="Rechercher une procédure…"
              value={rechercheProcedure}
              onChange={(e) => setRechercheProcedure(e.target.value)}
              style={{ width: "100%", marginBottom: 8 }}
            />
            {proceduresFiltrees.length === 0 ? (
              <p className="empty-state-description" style={{ margin: 0 }}>
                Aucune procédure ne correspond.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {proceduresFiltrees.map((p) => (
                  <button
                    key={p.id}
                    className={
                      "btn-ghost" +
                      (procedureSelectionnee?.id === p.id ? " btn-espace-actif" : "")
                    }
                    style={{ justifyContent: "flex-start", textAlign: "left" }}
                    onClick={() => setProcedureSelectionneeId(p.id)}
                  >
                    {p.titre}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        {!procedureSelectionnee ? (
          <div className="empty-state">
            <p className="empty-state-title">Aucune procédure sélectionnée</p>
            <p className="empty-state-description">
              Choisissez une procédure dans la liste, ou créez-en une nouvelle.
            </p>
          </div>
        ) : (
          <div className="panel" style={{ padding: 20 }}>
            <div className="panel-header" style={{ alignItems: "flex-start" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{procedureSelectionnee.titre}</h2>
                {procedureSelectionnee.commentaire && (
                  <p className="page-subtitle" style={{ whiteSpace: "pre-wrap" }}>
                    {procedureSelectionnee.commentaire}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setProcedureEnEdition(procedureSelectionnee);
                    setAfficherFormProcedure(true);
                  }}
                >
                  Modifier
                </button>
                <button
                  className="btn-ghost btn-danger"
                  onClick={() => supprimerProcedure(procedureSelectionnee)}
                  disabled={suppressionEnCours === procedureSelectionnee.id}
                >
                  {suppressionEnCours === procedureSelectionnee.id
                    ? "Suppression…"
                    : "Supprimer la procédure"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, margin: "12px 0 16px" }}>
              <button
                className="btn-primary"
                onClick={() => {
                  setBlocEnEdition(null);
                  setAfficherFormBloc(true);
                }}
              >
                + Ajouter un bloc
              </button>
              <button className="btn-ghost" onClick={() => setAfficherImportWord(true)}>
                📄 Importer un fichier Word
              </button>
              <button className="btn-ghost" onClick={() => setAfficherImport(true)}>
                📋 Coller un document
              </button>
            </div>

            {blocs.length === 0 ? (
              <p className="empty-state-description">
                Aucun contenu pour cette procédure pour l'instant.
              </p>
            ) : (
              <div className="procedure-layout">
                {sommaire.length > 0 && (
                  <nav className="procedure-sommaire">
                    <p className="simple-list-meta" style={{ margin: "0 0 6px" }}>
                      Table des matières
                    </p>
                    {sommaire.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        className={"procedure-sommaire-item procedure-sommaire-niveau" + s.niveau}
                        onClick={() => allerAuBloc(s.id)}
                      >
                        {s.texte}
                      </button>
                    ))}
                  </nav>
                )}
                <div className="procedure-contenu">
                  {blocs.map((b) => (
                    <BlocContenu
                      key={b.id}
                      bloc={b}
                      onModifier={() => {
                        setBlocEnEdition(b);
                        setAfficherFormBloc(true);
                      }}
                      onSupprimer={() => supprimerBloc(b)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {afficherFormProcedure && (
        <ProcedureFormModal
          procedure={procedureEnEdition}
          onClose={() => setAfficherFormProcedure(false)}
        />
      )}
      {afficherFormBloc && procedureSelectionnee && (
        <BlocFormModal
          procedureId={procedureSelectionnee.id}
          bloc={blocEnEdition}
          nbExistants={blocs.length}
          onClose={() => setAfficherFormBloc(false)}
        />
      )}
      {afficherImport && procedureSelectionnee && (
        <ImportDocumentModal
          procedureId={procedureSelectionnee.id}
          nbExistants={blocs.length}
          onClose={() => setAfficherImport(false)}
        />
      )}
      {afficherImportWord && procedureSelectionnee && (
        <ImportWordModal
          procedureId={procedureSelectionnee.id}
          nbExistants={blocs.length}
          onClose={() => setAfficherImportWord(false)}
        />
      )}
    </div>
  );
}

export default function Aide() {
  const [onglet, setOnglet] = useState(ONGLETS[0].cle);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Aide</h1>
          <p className="page-subtitle">
            Fiches de référence alimentées et tenues à jour par l'équipe.
          </p>
        </div>
      </header>

      <div className="chantier-actions-bar" style={{ marginBottom: 20 }}>
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            className={onglet === o.cle ? "btn-primary" : "btn-ghost"}
            onClick={() => setOnglet(o.cle)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {onglet === "modbus-socomec" && <CompteursModbusTab />}
      {onglet === "procedures" && <ProceduresTab />}
    </div>
  );
}
