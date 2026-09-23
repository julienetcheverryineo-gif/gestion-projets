import { useState } from "react";
import {
  usePlanningData,
  joursEntre,
  libelleMois,
  arrondirHeures,
  PLAFOND_MENSUEL,
} from "../lib/usePlanningData";
import FiltreChantier from "../components/FiltreChantier";
import TacheGanttModal from "../components/TacheGanttModal";

function classeCharge(h) {
  if (h > PLAFOND_MENSUEL) return "charge-cellule-rouge";
  if (h > PLAFOND_MENSUEL * 0.75) return "charge-cellule-orange";
  if (h > 0) return "charge-cellule-verte";
  return "charge-cellule-vide";
}

export default function PlanningDetaille() {
  const {
    chargement,
    chantiers,
    chantierFiltre,
    setChantierFiltre,
    tachesGantt,
    tachesSansDatesCompletes,
    gantt,
    charge,
  } = usePlanningData();
  const [tacheEnEdition, setTacheEnEdition] = useState(null);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Planning détaillé</h1>
        <p className="page-subtitle">
          Gantt tâche par tâche et charge du service (plafond {PLAFOND_MENSUEL} h/mois).
        </p>
      </header>

      <FiltreChantier chantiers={chantiers} valeur={chantierFiltre} onChange={setChantierFiltre} />

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>Gantt détaillé</h2>
              <span className="simple-list-meta">
                {tachesGantt.length} tâche(s) avec dates complètes
                {tachesSansDatesCompletes.length > 0 &&
                  " · " + tachesSansDatesCompletes.length + " sans dates, non affichée(s) ici"}
                {" · cliquer une tâche pour la recaler"}
              </span>
            </div>

            {!gantt ? (
              <div className="empty-state">
                <p className="empty-state-title">Aucune tâche datée</p>
                <p className="empty-state-description">
                  Le Gantt affiche les tâches ayant à la fois une date de début et une date de
                  fin. Renseignez ces dates dans l'onglet Tâches d'un chantier pour les voir
                  apparaître ici.
                </p>
              </div>
            ) : (
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

                  {[...gantt.parChantier.entries()].map(([cle, groupe]) => (
                    <div key={cle} className="gantt-groupe">
                      <div className="gantt-groupe-titre">{groupe.nom}</div>
                      {groupe.taches.map((t) => {
                        const left = joursEntre(gantt.debutTimeline, t.dateDebut) * gantt.pxParJour;
                        const largeur = Math.max(
                          6,
                          (joursEntre(t.dateDebut, t.echeance) + 1) * gantt.pxParJour
                        );
                        return (
                          <div key={t.id} className="gantt-ligne">
                            <div className="gantt-ligne-titre" title={t.titre}>
                              {t.titre}
                            </div>
                            <div className="gantt-piste" style={{ width: gantt.largeurTotale }}>
                              {gantt.ligneAujourdHui !== null && (
                                <div className="gantt-aujourdhui" style={{ left: gantt.ligneAujourdHui }} />
                              )}
                              <button
                                type="button"
                                className={"gantt-barre gantt-barre-cliquable gantt-barre-" + (t.statut ?? "a_faire")}
                                style={{ left, width: largeur }}
                                title={t.titre + " — " + t.dateDebut + " → " + t.echeance + " — cliquer pour recaler"}
                                onClick={() => setTacheEnEdition(t)}
                              >
                                {t.heuresPrevues ? (
                                  <span className="gantt-barre-heures">{t.heuresPrevues} h</span>
                                ) : null}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

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
        </>
      )}

      {tacheEnEdition && (
        <TacheGanttModal tache={tacheEnEdition} onClose={() => setTacheEnEdition(null)} />
      )}
    </div>
  );
}
