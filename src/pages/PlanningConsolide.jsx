import { usePlanningData, arrondirHeures } from "../lib/usePlanningData";
import FiltreChantier from "../components/FiltreChantier";

export default function PlanningConsolide() {
  const { chargement, chantiers, chantierFiltre, setChantierFiltre, gantt } = usePlanningData();

  return (
    <div className="page">
      <header className="page-header">
        <h1>Planning consolidé</h1>
        <p className="page-subtitle">
          Une barre par chantier, du plus tôt au plus tard parmi ses tâches datées.
        </p>
      </header>

      <FiltreChantier chantiers={chantiers} valeur={chantierFiltre} onChange={setChantierFiltre} />

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : !gantt ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucun chantier positionnable</p>
          <p className="empty-state-description">
            Cette vue a besoin d'au moins une tâche avec une date de début et une date de fin par
            chantier pour tracer sa barre. Renseignez ces dates dans l'onglet Tâches d'un
            chantier.
          </p>
        </div>
      ) : (
        <section className="panel">
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: gantt.largeurTotale + 180 }}>
              <div className="gantt-mois-header" style={{ marginLeft: 180 }}>
                <div style={{ position: "relative", height: 24, width: gantt.largeurTotale }}>
                  {gantt.mois.map((m) => (
                    <div key={m.cle} className="gantt-mois-label" style={{ left: m.left }}>
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>
              {gantt.chantierBars.map((cb) => (
                <div key={cb.cle} className="gantt-ligne">
                  <div className="gantt-ligne-titre" title={cb.nom}>
                    {cb.nom}
                  </div>
                  <div className="gantt-piste" style={{ width: gantt.largeurTotale }}>
                    {gantt.ligneAujourdHui !== null && (
                      <div className="gantt-aujourdhui" style={{ left: gantt.ligneAujourdHui }} />
                    )}
                    <div
                      className="gantt-barre gantt-barre-chantier"
                      style={{ left: cb.left, width: cb.largeur }}
                      title={cb.nom + " — " + arrondirHeures(cb.heuresTotal) + " h au total"}
                    >
                      <span className="gantt-barre-heures">{arrondirHeures(cb.heuresTotal)} h</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
