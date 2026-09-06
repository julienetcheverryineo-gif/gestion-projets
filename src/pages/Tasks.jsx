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

const COLONNES = [
  { statut: "a_faire", titre: "À faire" },
  { statut: "en_cours", titre: "En cours" },
  { statut: "termine", titre: "Terminé" },
];

export default function Tasks() {
  const { profile, isAdmin, isChefDeProjet } = useAuth();
  const peutSupprimer = isAdmin || isChefDeProjet;
  const { documents: taches } = useCollection("tasks");
  const { documents: projets } = useCollection("projects");
  const { documents: utilisateurs } = useCollection("users", "email");
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [colonneCible, setColonneCible] = useState(null);

  const changerStatut = async (tacheId, nouveauStatut) => {
    await updateDoc(doc(db, "tasks", tacheId), { statut: nouveauStatut });
  };

  const supprimer = async (tacheId) => {
    if (!confirm("Supprimer cette tâche ?")) return;
    await deleteDoc(doc(db, "tasks", tacheId));
  };

  const handleDrop = (e, statutCible) => {
    e.preventDefault();
    const tacheId = e.dataTransfer.getData("text/tache-id");
    if (tacheId) changerStatut(tacheId, statutCible);
  };

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1>Tâches</h1>
          <p className="page-subtitle">Glissez une carte pour changer son statut.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setColonneCible("a_faire");
            setAfficherFormulaire(true);
          }}
        >
          Nouvelle tâche
        </button>
      </header>

      <div className="kanban-board">
        {COLONNES.map((colonne) => (
          <div
            key={colonne.statut}
            className="kanban-column"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, colonne.statut)}
          >
            <div className="kanban-column-header">
              <h3>{colonne.titre}</h3>
              <span className="kanban-count">
                {taches.filter((t) => (t.statut ?? "a_faire") === colonne.statut).length}
              </span>
            </div>

            <div className="kanban-cards">
              {taches
                .filter((t) => (t.statut ?? "a_faire") === colonne.statut)
                .map((tache) => (
                  <div
                    key={tache.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/tache-id", tache.id)
                    }
                  >
                    <div className="kanban-card-title">{tache.titre}</div>
                    <div className="kanban-card-meta">
                      {nomProjet(projets, tache.projetId)}
                    </div>
                    <div className="kanban-card-footer">
                      <span className="kanban-card-assignee">
                        {tache.assigneA ?? "Non assigné"}
                      </span>
                      {tache.echeance && (
                        <span className="kanban-card-date">{tache.echeance}</span>
                      )}
                    </div>
                    {peutSupprimer && (
                      <button
                        className="kanban-card-delete"
                        onClick={() => supprimer(tache.id)}
                        aria-label="Supprimer la tâche"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              <button
                className="kanban-add-inline"
                onClick={() => {
                  setColonneCible(colonne.statut);
                  setAfficherFormulaire(true);
                }}
              >
                + Ajouter une tâche
              </button>
            </div>
          </div>
        ))}
      </div>

      {afficherFormulaire && (
        <TaskFormModal
          statutInitial={colonneCible}
          projets={projets}
          utilisateurs={utilisateurs}
          profil={profile}
          onClose={() => setAfficherFormulaire(false)}
        />
      )}
    </div>
  );
}

function nomProjet(projets, projetId) {
  return projets.find((p) => p.id === projetId)?.nom ?? "Sans projet";
}

function TaskFormModal({ statutInitial, projets, utilisateurs, onClose }) {
  const [titre, setTitre] = useState("");
  const [projetId, setProjetId] = useState(projets[0]?.id ?? "");
  const [assigneA, setAssigneA] = useState("");
  const [echeance, setEcheance] = useState("");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    await addDoc(collection(db, "tasks"), {
      titre,
      projetId: projetId || null,
      assigneA: assigneA || null,
      echeance: echeance || null,
      statut: statutInitial,
      creeLe: serverTimestamp(),
    });
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nouvelle tâche</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Titre
            <input value={titre} onChange={(e) => setTitre(e.target.value)} required />
          </label>
          <label>
            Projet
            <select value={projetId} onChange={(e) => setProjetId(e.target.value)}>
              <option value="">Sans projet</option>
              {projets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assigné à
            <select value={assigneA} onChange={(e) => setAssigneA(e.target.value)}>
              <option value="">Non assigné</option>
              {utilisateurs.map((u) => (
                <option key={u.id} value={u.nom}>
                  {u.nom}
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
              {enCours ? "Création…" : "Créer la tâche"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
