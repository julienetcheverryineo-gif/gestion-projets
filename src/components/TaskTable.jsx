import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

const STATUTS_TASK = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
];

const STATUTS_REGITEM = [
  { value: "a_faire", label: "À faire" },
  { value: "fait", label: "Fait" },
];

// Affiche indifféremment des tâches "projet" (collection `tasks`) et des
// tâches issues d'un équipement régulé (`regitems` de type "tache") dans un
// seul tableau. `t._source` vaut "regitem" pour ces dernières ; leur
// désignation/statut ne peuvent être modifiés que depuis la fiche de
// l'équipement (pas de bouton Modifier/Supprimer ici), mais le statut reste
// modifiable directement, comme sur les tâches normales.
export default function TaskTable({ taches, peutGerer, onEdit, onDelete, afficherChantier, nomChantier }) {
  const changerStatut = async (t, statut) => {
    if (t._source === "regitem") {
      await updateDoc(doc(db, "regitems", t.id), { statut });
    } else {
      await updateDoc(doc(db, "tasks", t.id), { statut });
    }
  };

  if (taches.length === 0) {
    return (
      <p className="empty-state-description" style={{ margin: "8px 0" }}>
        Aucune tâche.
      </p>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          {afficherChantier && <th>Chantier</th>}
          <th>Titre</th>
          <th>Responsable</th>
          <th>Heures</th>
          <th>Début</th>
          <th>Fin</th>
          <th>Statut</th>
          <th>Commentaires</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {taches.map((t) => {
          const estRegitem = t._source === "regitem";
          const options = estRegitem ? STATUTS_REGITEM : STATUTS_TASK;
          return (
            <tr key={(t._source || "task") + "-" + t.id}>
              {afficherChantier && (
                <td style={{ fontFamily: "var(--font-ui)" }}>
                  {t.chantierId ? nomChantier(t.chantierId) : "À affecter"}
                </td>
              )}
              <td style={{ fontFamily: "var(--font-ui)" }}>
                {t.titre}
                {estRegitem && (
                  <span className="simple-list-meta" style={{ marginLeft: 6 }}>
                    (équipement : {t._equipementNom})
                  </span>
                )}
              </td>
              <td style={{ fontFamily: "var(--font-ui)" }}>{t.assigneA || "À affecter"}</td>
              <td>{t.heuresPrevues || "—"}</td>
              <td>{t.dateDebut || "—"}</td>
              <td>{t.echeance || "—"}</td>
              <td>
                <select
                  value={t.statut ?? "a_faire"}
                  onChange={(e) => changerStatut(t, e.target.value)}
                >
                  {options.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}>
                {t.commentaires || "—"}
              </td>
              <td>
                {estRegitem ? (
                  <span className="simple-list-meta">Depuis équipement</span>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-ghost" onClick={() => onEdit(t)}>
                      Modifier
                    </button>
                    {peutGerer && (
                      <button className="btn-ghost btn-danger" onClick={() => onDelete(t.id)}>
                        ×
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
