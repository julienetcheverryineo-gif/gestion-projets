import { libelleMois, arrondirHeures } from "../lib/usePlanningData";

function formatStatutTache(statut) {
  switch (statut) {
    case "en_cours":
      return "En cours";
    case "termine":
      return "Terminé";
    default:
      return "À faire";
  }
}

// Détail des tâches d'une personne pour un mois donné (ou pour "non
// planifié"), pour comprendre d'où vient une charge élevée. Les heures
// affichées par tâche sont déjà la part attribuée à ce mois précis (une
// tâche à cheval sur plusieurs mois est répartie au prorata ailleurs).
export default function ChargeDetailModal({ nomPersonne, libelleColonne, entrees, nomChantier, onClose }) {
  const total = entrees.reduce((s, e) => s + e.heures, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{nomPersonne}</h2>
        <p className="empty-state-description" style={{ margin: "0 0 14px" }}>
          {libelleColonne} — {arrondirHeures(total)} h au total
        </p>
        {entrees.length === 0 ? (
          <p className="empty-state-description">Aucune tâche.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Chantier</th>
                <th>Tâche</th>
                <th>Heures</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {entrees
                .slice()
                .sort((a, b) => b.heures - a.heures)
                .map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: "var(--font-ui)" }}>
                      {e.chantierId ? nomChantier(e.chantierId) : "À affecter"}
                    </td>
                    <td style={{ fontFamily: "var(--font-ui)" }}>{e.titre}</td>
                    <td>{arrondirHeures(e.heures)} h</td>
                    <td style={{ fontFamily: "var(--font-ui)" }}>{formatStatutTache(e.statut)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
