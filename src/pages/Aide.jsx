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
import { db } from "../firebase";
import { useCollection } from "../lib/firestoreHooks";

// Page "Aide" côté Automatisme & GTB : pensée pour accueillir plusieurs
// fiches de référence au fil du temps (onglets), alimentées et mises à
// jour par l'équipe elle-même plutôt que figées dans le code — on
// commence avec les tables d'échange Modbus des compteurs Socomec,
// d'autres onglets viendront s'ajouter au même endroit.
const ONGLETS = [{ cle: "modbus-socomec", label: "📋 Table échange modbus" }];

const TYPES_REGISTRE = ["uint16", "int16", "uint32", "int32", "float32", "bool", "string", "autre"];
const ACCES_REGISTRE = [
  { value: "lecture", label: "Lecture" },
  { value: "ecriture", label: "Écriture" },
  { value: "lecture_ecriture", label: "Lecture/Écriture" },
];
function formatAcces(v) {
  return ACCES_REGISTRE.find((a) => a.value === v)?.label ?? v;
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

  const termesProduit = rechercheProduit.trim().toLowerCase();
  const compteursFiltres = termesProduit
    ? compteurs.filter((c) => (c.nom || "").toLowerCase().includes(termesProduit))
    : compteurs;

  const [rechercheRegistre, setRechercheRegistre] = useState("");
  const [nbAffiches, setNbAffiches] = useState(50);

  const registres = compteurSelectionne
    ? registresBruts
        .filter((r) => r.compteurId === compteurSelectionne.id)
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    : [];

  const termesRegistre = rechercheRegistre.trim().toLowerCase();
  const registresFiltres = termesRegistre
    ? registres.filter((r) =>
        [r.adresse, r.designation, r.type, r.unite, r.commentaire].some((champ) =>
          String(champ ?? "").toLowerCase().includes(termesRegistre)
        )
      )
    : registres;

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
                  placeholder="Rechercher un registre (adresse, désignation, unité, commentaire…)"
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
                          <th>Adresse</th>
                          <th>Désignation</th>
                          <th>Type</th>
                          <th>Unité</th>
                          <th>Accès</th>
                          <th>Commentaire</th>
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
    </div>
  );
}
