import { useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";

const STATUTS = [
  { value: "actif", label: "Actif" },
  { value: "en_pause", label: "En pause" },
  { value: "termine", label: "Terminé" },
];

export default function Sites() {
  const { isAdmin, isChefDeProjet } = useAuth();
  const peutGerer = isAdmin || isChefDeProjet;
  const { documents: chantiers, chargement } = useCollection("sites");
  const { documents: lots } = useCollection("lots");
  const [chantierEnEdition, setChantierEnEdition] = useState(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);

  const supprimer = async (id) => {
    if (!confirm("Supprimer ce chantier ? Les lots et équipements associés resteront orphelins.")) return;
    await deleteDoc(doc(db, "sites", id));
  };

  const avancement = (chantierId) => {
    const lotsDuChantier = lots.filter((l) => l.chantierId === chantierId);
    if (lotsDuChantier.length === 0) return null;
    const moyenne =
      lotsDuChantier.reduce((sum, l) => sum + (l.avancement ?? 0), 0) /
      lotsDuChantier.length;
    return Math.round(moyenne);
  };

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1>Chantiers</h1>
          <p className="page-subtitle">Vos chantiers automatisme &amp; GTB en cours.</p>
        </div>
        {peutGerer && (
          <button
            className="btn-primary"
            onClick={() => {
              setChantierEnEdition(null);
              setAfficherFormulaire(true);
            }}
          >
            Nouveau chantier
          </button>
        )}
      </header>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : chantiers.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucun chantier</p>
          <p className="empty-state-description">
            Créez votre premier chantier pour commencer à suivre les lots techniques.
          </p>
        </div>
      ) : (
        <div className="project-grid">
          {chantiers.map((chantier) => {
            const pct = avancement(chantier.id);
            return (
              <div key={chantier.id} className="project-card">
                <div className="project-card-header">
                  <span className={"status-dot status-" + (chantier.statut ?? "actif")} />
                  <h3>{chantier.nom}</h3>
                </div>
                {chantier.client && (
                  <p className="project-card-description">Client : {chantier.client}</p>
                )}
                <div className="project-card-meta">
                  <span>{formatStatut(chantier.statut)}</span>
                  {pct !== null && <span>Avancement : {pct}%</span>}
                </div>
                {pct !== null && (
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: pct + "%" }} />
                  </div>
                )}
                <div className="project-card-actions">
                  <Link to={"/chantiers/" + chantier.id} className="btn-ghost">
                    Ouvrir
                  </Link>
                  {peutGerer && (
                    <button
                      className="btn-ghost btn-danger"
                      onClick={() => supprimer(chantier.id)}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {afficherFormulaire && (
        <SiteFormModal
          chantier={chantierEnEdition}
          onClose={() => setAfficherFormulaire(false)}
        />
      )}
    </div>
  );
}

function SiteFormModal({ chantier, onClose }) {
  const [nom, setNom] = useState(chantier?.nom ?? "");
  const [client, setClient] = useState(chantier?.client ?? "");
  const [adresse, setAdresse] = useState(chantier?.adresse ?? "");
  const [statut, setStatut] = useState(chantier?.statut ?? "actif");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    const donnees = { nom, client, adresse, statut };
    if (chantier) {
      await updateDoc(doc(db, "sites", chantier.id), donnees);
    } else {
      await addDoc(collection(db, "sites"), { ...donnees, creeLe: serverTimestamp() });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{chantier ? "Modifier le chantier" : "Nouveau chantier"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Nom du chantier
            <input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </label>
          <label>
            Client
            <input value={client} onChange={(e) => setClient(e.target.value)} />
          </label>
          <label>
            Adresse
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
          </label>
          <label>
            Statut
            <select value={statut} onChange={(e) => setStatut(e.target.value)}>
              {STATUTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
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

export function formatStatut(statut) {
  return STATUTS.find((s) => s.value === statut)?.label ?? statut;
}
