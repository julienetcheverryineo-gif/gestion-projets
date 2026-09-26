import { libelleMois, arrondirHeures, PLAFOND_MENSUEL } from "../lib/usePlanningData";

function classeCharge(h) {
  if (h > PLAFOND_MENSUEL) return "charge-cellule-rouge";
  if (h > PLAFOND_MENSUEL * 0.75) return "charge-cellule-orange";
  if (h > 0) return "charge-cellule-verte";
  return "charge-cellule-vide";
}

// Un tableau de charge (personne × mois), pour un seul groupe à la fois
// (automaticiens ou électriciens — voir ChargeSection). Chaque cellule
// avec des heures est cliquable pour ouvrir le détail des tâches
// correspondantes.
export default function ChargeTable({ titre, personnes, moisTries, onOuvrirDetail }) {
  if (personnes.length === 0) {
    return (
      <p className="empty-state-description" style={{ margin: "8px 0" }}>
        Aucune heure pour les {titre.toLowerCase()}.
      </p>
    );
  }

  return (
    <div className="hscroll-auto" style={{ overflowX: "auto" }}>
      <table className="data-table charge-table" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ width: 160 }}>{titre}</th>
            {moisTries.map((m) => (
              <th key={m} style={{ width: 90 }}>
                {libelleMois(m)}
              </th>
            ))}
            <th style={{ width: 110 }}>Non planifié</th>
            <th style={{ width: 90 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {personnes.map((p) => (
            <tr key={p.nom}>
              <td data-label={titre} style={{ fontFamily: "var(--font-ui)", fontWeight: 500 }}>
                {p.nom}
              </td>
              {moisTries.map((m) => {
                const h = p.parMois[m] || 0;
                return (
                  <td key={m} data-label={libelleMois(m)}>
                    {h > 0 ? (
                      <button
                        type="button"
                        className={"charge-cellule charge-cellule-btn " + classeCharge(h)}
                        onClick={() => onOuvrirDetail(p, m)}
                      >
                        {arrondirHeures(h)} h
                      </button>
                    ) : (
                      <div className="charge-cellule charge-cellule-vide">—</div>
                    )}
                  </td>
                );
              })}
              <td data-label="Non planifié">
                {p.nonPlanifie > 0 ? (
                  <button
                    type="button"
                    className="charge-cellule-lien"
                    onClick={() => onOuvrirDetail(p, "nonPlanifie")}
                  >
                    {arrondirHeures(p.nonPlanifie)} h
                  </button>
                ) : (
                  <span className="simple-list-meta">—</span>
                )}
              </td>
              <td data-label="Total" style={{ fontFamily: "var(--font-ui)", fontWeight: 600 }}>
                {arrondirHeures(p.total)} h
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
