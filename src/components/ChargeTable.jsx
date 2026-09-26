import { Fragment } from "react";
import { libelleMois, arrondirHeures, PLAFOND_MENSUEL } from "../lib/usePlanningData";

function classeCharge(h) {
  if (h > PLAFOND_MENSUEL) return "charge-cellule-rouge";
  if (h > PLAFOND_MENSUEL * 0.75) return "charge-cellule-orange";
  if (h > 0) return "charge-cellule-verte";
  return "charge-cellule-vide";
}

// Tableau de charge (personne × mois) pour tout le service : un seul jeu
// de colonnes-mois et un seul défilement horizontal pour automaticiens et
// électriciens (au lieu de deux tableaux distincts, désynchronisés au
// défilement et avec les mois dupliqués) — mais la séparation métier
// reste visible via une ligne d'en-tête par groupe. `groupes` est un
// tableau de { titre, personnes }.
export default function ChargeTable({ groupes, moisTries, onOuvrirDetail }) {
  const nbColonnes = moisTries.length + 3;
  const total = groupes.reduce((s, g) => s + g.personnes.length, 0);

  if (total === 0) {
    return (
      <p className="empty-state-description" style={{ margin: "8px 0" }}>
        Aucune heure pour le moment.
      </p>
    );
  }

  return (
    <div className="hscroll-auto" style={{ overflowX: "auto" }}>
      <table className="data-table charge-table" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th className="charge-table-col-personne" style={{ width: 160 }}>
              Personne
            </th>
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
          {groupes.map((g) => (
            <Fragment key={g.titre}>
              <tr className="charge-table-groupe">
                <td colSpan={nbColonnes}>{g.titre}</td>
              </tr>
              {g.personnes.length === 0 ? (
                <tr>
                  <td colSpan={nbColonnes}>
                    <span className="simple-list-meta">Aucune heure pour les {g.titre.toLowerCase()}.</span>
                  </td>
                </tr>
              ) : (
                g.personnes.map((p) => (
                  <tr key={g.titre + "-" + p.nom}>
                    <td
                      data-label="Personne"
                      className="charge-table-col-personne"
                      style={{ fontFamily: "var(--font-ui)", fontWeight: 500 }}
                    >
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
                ))
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
