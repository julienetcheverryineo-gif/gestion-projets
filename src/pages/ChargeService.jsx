import { usePlanningData, libelleMois, arrondirHeures, PLAFOND_MENSUEL } from "../lib/usePlanningData";
import FiltreChantier from "../components/FiltreChantier";

function classeCharge(h) {
  if (h > PLAFOND_MENSUEL) return "charge-cellule-rouge";
  if (h > PLAFOND_MENSUEL * 0.75) return "charge-cellule-orange";
  if (h > 0) return "charge-cellule-verte";
  return "charge-cellule-vide";
}

export default function ChargeService() {
  const { chargement, chantiers, chantierFiltre, setChantierFiltre, charge } = usePlanningData();

  return (
    <div className="page">
      <header className="page-header">
        <h1>Charge du service</h1>
        <p className="page-subtitle">
          Heures prévues par personne et par mois, plafond {PLAFOND_MENSUEL} h/mois.
        </p>
      </header>

      <FiltreChantier chantiers={chantiers} valeur={chantierFiltre} onChange={setChantierFiltre} />

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : (
        <section className="panel">
          <div className="panel-header">
            <h2>Charge du service</h2>
            <span className="simple-list-meta">
              Vert : sous 75 % du plafond · Orange : proche · Rouge : dépassé
            </span>
          </div>

          {charge.personnes.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">Aucune heure affectée</p>
              <p className="empty-state-description">
                Renseignez des heures prévues et un responsable sur vos tâches pour voir la
                charge apparaître ici.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table charge-table" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Automaticien</th>
                    {charge.moisTries.map((m) => (
                      <th key={m} style={{ width: 90 }}>
                        {libelleMois(m)}
                      </th>
                    ))}
                    <th style={{ width: 110 }}>Non planifié</th>
                    <th style={{ width: 90 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {charge.personnes.map((p) => (
                    <tr key={p.nom}>
                      <td data-label="Automaticien" style={{ fontFamily: "var(--font-ui)", fontWeight: 500 }}>
                        {p.nom}
                      </td>
                      {charge.moisTries.map((m) => {
                        const h = p.parMois[m] || 0;
                        return (
                          <td key={m} data-label={libelleMois(m)}>
                            <div className={"charge-cellule " + classeCharge(h)}>
                              {h > 0 ? arrondirHeures(h) + " h" : "—"}
                            </div>
                          </td>
                        );
                      })}
                      <td data-label="Non planifié">
                        <span className="simple-list-meta">
                          {p.nonPlanifie > 0 ? arrondirHeures(p.nonPlanifie) + " h" : "—"}
                        </span>
                      </td>
                      <td data-label="Total" style={{ fontFamily: "var(--font-ui)", fontWeight: 600 }}>
                        {arrondirHeures(p.total)} h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
