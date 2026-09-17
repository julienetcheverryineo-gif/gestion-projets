import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

const STATUTS = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
];

export default function TaskTable({ taches, peutGerer, onEdit, onDelete, afficherChantier, nomChantier }) {
  const changerStatut = async (id, statut) => {
    await updateDoc(doc(db, "tasks", id), { statut });
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
        {taches.map((t) => (
          <tr key={t.id}>
            {afficherChantier && (
              <td style={{ fontFamily: "var(--font-ui)" }}>
                {t.chantierId ? nomChantier(t.chantierId) : "À affecter"}
              </td>
            )}
            <td style={{ fontFamily: "var(--font-ui)" }}>{t.titre}</td>
            <td style={{ fontFamily: "var(--font-ui)" }}>{t.assigneA || "À affecter"}</td>
            <td>{t.heuresPrevues || "—"}</td>
            <td>{t.dateDebut || "—"}</td>
            <td>{t.echeance || "—"}</td>
            <td>
              <select
                value={t.statut ?? "a_faire"}
                onChange={(e) => changerStatut(t.id, e.target.value)}
              >
                {STATUTS.map((s) => (
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
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
