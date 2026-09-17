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

function statutPrecedent(statut) {
  const i = COLONNES.findIndex((c) => c.statut === statut);
  return i > 0 ? COLONNES[i - 1].statut : null;
}

function statutSuivant(statut) {
  const i = COLONNES.findIndex((c) => c.statut === statut);
  return i < COLONNES.length - 1 ? COLONNES[i + 1].statut : null;
}

export default function Tasks() {
  const { profile, isAdmin, isChefDeProjet } = useAuth();
  const peutSupprimer = isAdmin || isChefDeProjet;
  const { documents: taches } = useCollection("tasks");
  const { documents: chantiers } = useCollection("sites");
  const { documents: utilisateurs } = useCollection("users", "email");
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [colonneCible, setColonneCible] = useState(null);
  const [tacheEnEdition, setTacheEnEdition] = useState(null);

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
            setTacheEnEdition(null);
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
                    onClick={() => {
                      setTacheEnEdition(tache);
                      setColonneCible(tache.statut ?? "a_faire");
                      setAfficherFormulaire(true);
                    }}
                  >
                    <div className="kanban-card-title">{tache.titre}</div>
                    <div className="kanban-card-meta">
                      {nomChantier(chantiers, tache.chantierId)}
                      {tache.heuresPrevues ? " · " + tache.heuresPrevues + " h" : ""}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          supprimer(tache.id);
                        }}
                        aria-label="Supprimer la tâche"
                      >
                        ×
                      </button>
                    )}
                    <div className="kanban-card-move">
                      <button
                        className="kanban-move-btn"
                        disabled={!statutPrecedent(tache.statut ?? "a_faire")}
                        onClick={(e) => {
                          e.stopPropagation();
                          changerStatut(tache.id, statutPrecedent(tache.statut ?? "a_faire"));
                        }}
                        aria-label="Déplacer vers la colonne précédente"
                      >
                        ← Retour
                      </button>
                      <button
                        className="kanban-move-btn"
                        disabled={!statutSuivant(tache.statut ?? "a_faire")}
                        onClick={(e) => {
                          e.stopPropagation();
                          changerStatut(tache.id, statutSuivant(tache.statut ?? "a_faire"));
                        }}
                        aria-label="Déplacer vers la colonne suivante"
                      >
                        Avancer →
                      </button>
                    </div>
                  </div>
                ))}
              <button
                className="kanban-add-inline"
                onClick={() => {
                  setColonneCible(colonne.statut);
                  setTacheEnEdition(null);
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
          tache={tacheEnEdition}
          chantiers={chantiers}
          utilisateurs={utilisateurs}
          onClose={() => setAfficherFormulaire(false)}
        />
      )}
    </div>
  );
}

function nomChantier(chantiers, chantierId) {
  return chantiers.find((c) => c.id === chantierId)?.nom ?? "Sans chantier";
}

function TaskFormModal({ statutInitial, tache, chantiers, utilisateurs, onClose }) {
  const [titre, setTitre] = useState(tache?.titre ?? "");
  const [chantierId, setChantierId] = useState(tache?.chantierId ?? chantiers[0]?.id ?? "");
  const [assigneA, setAssigneA] = useState(tache?.assigneA ?? "");
  const [heuresPrevues, setHeuresPrevues] = useState(tache?.heuresPrevues ?? "");
  const [dateDebut, setDateDebut] = useState(tache?.dateDebut ?? "");
  const [echeance, setEcheance] = useState(tache?.echeance ?? "");
  const [lienDevis, setLienDevis] = useState(tache?.lienDevis ?? "");
  const [commentaires, setCommentaires] = useState(tache?.commentaires ?? "");
  const [enCours, setEnCours] = useState(false);

  const compteChantier = chantiers.find((c) => c.id === chantierId)?.compte;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    const donnees = {
      titre,
      chantierId: chantierId || null,
      assigneA: assigneA || null,
      heuresPrevues: heuresPrevues ? Number(heuresPrevues) : null,
      dateDebut: dateDebut || null,
      echeance: echeance || null,
      lienDevis: lienDevis || null,
      commentaires: commentaires || null,
    };
    if (tache) {
      await updateDoc(doc(db, "tasks", tache.id), donnees);
    } else {
      await addDoc(collection(db, "tasks"), {
        ...donnees,
        statut: statutInitial,
        creeLe: serverTimestamp(),
      });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{tache ? "Modifier la tâche" : "Nouvelle tâche"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Titre
            <input value={titre} onChange={(e) => setTitre(e.target.value)} required />
          </label>
          <label>
            Chantier
            <select value={chantierId} onChange={(e) => setChantierId(e.target.value)}>
              <option value="">Sans chantier</option>
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </label>
          {compteChantier && (
            <p className="simple-list-meta" style={{ margin: "-6px 0 0" }}>
              Compte : {compteChantier}
            </p>
          )}
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
          <div className="form-inline">
            <label>
              Heures prévues
              <input
                type="number"
                min="0"
                value={heuresPrevues}
                onChange={(e) => setHeuresPrevues(e.target.value)}
              />
            </label>
            <label>
              Date début
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </label>
            <label>
              Date fin
              <input
                type="date"
                value={echeance}
                onChange={(e) => setEcheance(e.target.value)}
              />
            </label>
          </div>
          <label>
            Lien devis
            <input value={lienDevis} onChange={(e) => setLienDevis(e.target.value)} />
          </label>
          <label>
            Commentaires
            <textarea
              value={commentaires}
              onChange={(e) => setCommentaires(e.target.value)}
              rows={2}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Enregistrement…" : tache ? "Enregistrer" : "Créer la tâche"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
