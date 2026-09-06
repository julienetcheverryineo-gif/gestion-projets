import { useState } from "react";
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

export default function Projects() {
  const { isAdmin, isChefDeProjet } = useAuth();
  const peutGerer = isAdmin || isChefDeProjet;
  const { documents: projets, chargement } = useCollection("projects");
  const [projetEnEdition, setProjetEnEdition] = useState(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);

  const ouvrirCreation = () => {
    setProjetEnEdition(null);
    setAfficherFormulaire(true);
  };

  const ouvrirEdition = (projet) => {
    setProjetEnEdition(projet);
    setAfficherFormulaire(true);
  };

  const fermerFormulaire = () => setAfficherFormulaire(false);

  const supprimer = async (projetId) => {
    if (!confirm("Supprimer ce projet ? Cette action est irréversible.")) return;
    await deleteDoc(doc(db, "projects", projetId));
  };

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1>Projets</h1>
          <p className="page-subtitle">Tous les chantiers et projets de l'équipe.</p>
        </div>
        {peutGerer && (
          <button className="btn-primary" onClick={ouvrirCreation}>
            Nouveau projet
          </button>
        )}
      </header>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : projets.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucun projet</p>
          <p className="empty-state-description">
            {peutGerer
              ? "Créez le premier projet pour démarrer."
              : "Aucun projet ne vous a encore été assigné."}
          </p>
        </div>
      ) : (
        <div className="project-grid">
          {projets.map((projet) => (
            <div key={projet.id} className="project-card">
              <div className="project-card-header">
                <span className={"status-dot status-" + (projet.statut ?? "actif")} />
                <h3>{projet.nom}</h3>
              </div>
              {projet.description && (
                <p className="project-card-description">{projet.description}</p>
              )}
              <div className="project-card-meta">
                <span>{formatStatut(projet.statut)}</span>
                {projet.echeance && <span>Échéance : {projet.echeance}</span>}
              </div>
              {peutGerer && (
                <div className="project-card-actions">
                  <button className="btn-ghost" onClick={() => ouvrirEdition(projet)}>
                    Modifier
                  </button>
                  <button
                    className="btn-ghost btn-danger"
                    onClick={() => supprimer(projet.id)}
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {afficherFormulaire && (
        <ProjectFormModal projet={projetEnEdition} onClose={fermerFormulaire} />
      )}
    </div>
  );
}

function ProjectFormModal({ projet, onClose }) {
  const [nom, setNom] = useState(projet?.nom ?? "");
  const [description, setDescription] = useState(projet?.description ?? "");
  const [statut, setStatut] = useState(projet?.statut ?? "actif");
  const [echeance, setEcheance] = useState(projet?.echeance ?? "");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    const donnees = { nom, description, statut, echeance };
    if (projet) {
      await updateDoc(doc(db, "projects", projet.id), donnees);
    } else {
      await addDoc(collection(db, "projects"), {
        ...donnees,
        creeLe: serverTimestamp(),
      });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{projet ? "Modifier le projet" : "Nouveau projet"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Nom du projet
            <input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </label>
          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
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
          <label>
            Échéance
            <input
              type="date"
              value={echeance}
              onChange={(e) => setEcheance(e.target.value)}
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

function formatStatut(statut) {
  return STATUTS.find((s) => s.value === statut)?.label ?? statut;
}
