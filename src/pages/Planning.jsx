import { useState } from "react";
import { usePlanningData, joursEntre, libelleMois, arrondirHeures, PLAFOND_MENSUEL } from "../lib/usePlanningData";
import FiltreChantier from "../components/FiltreChantier";
import TacheGanttModal from "../components/TacheGanttModal";
import ChargeTable from "../components/ChargeTable";
import ChargeDetailModal from "../components/ChargeDetailModal";

const VUES = [
  { cle: "consolide", label: "Consolidé" },
  { cle: "detaille", label: "Détaillé" },
  { cle: "personne", label: "Par personne" },
  { cle: "charge", label: "Charge du service" },
];

export default function Planning() {
  const {
    chargement,
    chantiers,
    chantierFiltre,
    setChantierFiltre,
    tachesGantt,
    tachesSansDatesCompletes,
    gantt,
    charge,
    nomChantier,
  } = usePlanningData();
  const [vue, setVue] = useState("consolide");
  const [tacheEnEdition, setTacheEnEdition] = useState(null);
  const [detail, setDetail] = useState(null);

  const ouvrirDetail = (personne, cle) => {
    setDetail({
      nomPersonne: personne.nom,
      libelleColonne: cle === "nonPlanifie" ? "Non planifié" : libelleMois(cle),
      entrees: cle === "nonPlanifie" ? personne.detailNonPlanifie : personne.detailParMois[cle] || [],
    });
  };

  const automaticiensGantt = gantt?.personneGroupes.filter((g) => g.type === "automaticien") ?? [];
  const electriciensGantt = gantt?.personneGroupes.filter((g) => g.type === "electricien") ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>Planning</h1>
        <p className="page-subtitle">
          Gantt du service (consolidé, détaillé, par personne) et charge par rapport au plafond
          de {PLAFOND_MENSUEL} h/mois.
        </p>
      </header>

      <div className="chantier-actions-bar">
        {VUES.map((v) => (
          <button
            key={v.cle}
            className={vue === v.cle ? "btn-primary" : "btn-accent"}
            onClick={() => setVue(v.cle)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <FiltreChantier chantiers={chantiers} valeur={chantierFiltre} onChange={setChantierFiltre} />

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : (
        <>
          {vue === "consolide" && (
            <section className="panel">
              <div className="panel-header">
                <h2>Gantt consolidé</h2>
                <span className="simple-list-meta">Une barre par chantier.</span>
              </div>
              {!gantt ? (
                <EmptyGantt />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: gantt.largeurTotale + 180 }}>
                    <EnteteMois gantt={gantt} />
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
              )}
            </section>
          )}

          {vue === "detaille" && (
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
                <EmptyGantt />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: gantt.largeurTotale + 180 }}>
                    <EnteteMois gantt={gantt} />
                    {[...gantt.parChantier.entries()].map(([cle, groupe]) => (
                      <div key={cle} className="gantt-groupe">
                        <div className="gantt-groupe-titre">{groupe.nom}</div>
                        {groupe.taches.map((t) => (
                          <LigneTache
                            key={t.id}
                            titre={t.titre}
                            tache={t}
                            gantt={gantt}
                            onClick={() => setTacheEnEdition(t)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {vue === "personne" && (
            <>
              <section className="panel">
                <div className="panel-header">
                  <h2>Automaticiens</h2>
                  <span className="simple-list-meta">Cliquer une tâche pour la recaler.</span>
                </div>
                {!gantt ? (
                  <EmptyGantt />
                ) : (
                  <GanttParPersonne
                    groupes={automaticiensGantt}
                    gantt={gantt}
                    nomChantier={nomChantier}
                    onCliquerTache={setTacheEnEdition}
                  />
                )}
              </section>
              <section className="panel">
                <div className="panel-header">
                  <h2>Électriciens</h2>
                </div>
                {!gantt ? (
                  <EmptyGantt />
                ) : (
                  <GanttParPersonne
                    groupes={electriciensGantt}
                    gantt={gantt}
                    nomChantier={nomChantier}
                    onCliquerTache={setTacheEnEdition}
                  />
                )}
              </section>
            </>
          )}

          {vue === "charge" && (
            <>
              <section className="panel">
                <div className="panel-header">
                  <h2>Automaticiens</h2>
                  <span className="simple-list-meta">
                    Vert : sous 75 % du plafond · Orange : proche · Rouge : dépassé · cliquer une
                    case pour le détail
                  </span>
                </div>
                <ChargeTable
                  titre="Automaticien"
                  personnes={charge.automaticiens}
                  moisTries={charge.moisTries}
                  onOuvrirDetail={ouvrirDetail}
                />
              </section>
              <section className="panel">
                <div className="panel-header">
                  <h2>Électriciens</h2>
                </div>
                <ChargeTable
                  titre="Électricien"
                  personnes={charge.electriciens}
                  moisTries={charge.moisTries}
                  onOuvrirDetail={ouvrirDetail}
                />
              </section>
            </>
          )}
        </>
      )}

      {tacheEnEdition && (
        <TacheGanttModal tache={tacheEnEdition} onClose={() => setTacheEnEdition(null)} />
      )}
      {detail && (
        <ChargeDetailModal
          nomPersonne={detail.nomPersonne}
          libelleColonne={detail.libelleColonne}
          entrees={detail.entrees}
          nomChantier={nomChantier}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function EmptyGantt() {
  return (
    <div className="empty-state">
      <p className="empty-state-title">Aucune tâche datée</p>
      <p className="empty-state-description">
        Ces vues affichent les tâches ayant à la fois une date de début et une date de fin.
        Renseignez ces dates dans l'onglet Tâches d'un chantier pour les voir apparaître ici.
      </p>
    </div>
  );
}

function EnteteMois({ gantt }) {
  return (
    <div className="gantt-mois-header" style={{ marginLeft: 180 }}>
      <div style={{ position: "relative", height: 24, width: gantt.largeurTotale }}>
        {gantt.mois.map((m) => (
          <div key={m.cle} className="gantt-mois-label" style={{ left: m.left }}>
            {m.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function LigneTache({ titre, tache: t, gantt, onClick }) {
  const left = joursEntre(gantt.debutTimeline, t.dateDebut) * gantt.pxParJour;
  const largeur = Math.max(6, (joursEntre(t.dateDebut, t.echeance) + 1) * gantt.pxParJour);
  return (
    <div className="gantt-ligne">
      <div className="gantt-ligne-titre" title={titre}>
        {titre}
      </div>
      <div className="gantt-piste" style={{ width: gantt.largeurTotale }}>
        {gantt.ligneAujourdHui !== null && (
          <div className="gantt-aujourdhui" style={{ left: gantt.ligneAujourdHui }} />
        )}
        <button
          type="button"
          className={"gantt-barre gantt-barre-cliquable gantt-barre-" + (t.statut ?? "a_faire")}
          style={{ left, width: largeur }}
          title={titre + " — " + t.dateDebut + " → " + t.echeance + " — cliquer pour recaler"}
          onClick={onClick}
        >
          {t.heuresPrevues ? <span className="gantt-barre-heures">{t.heuresPrevues} h</span> : null}
        </button>
      </div>
    </div>
  );
}

function GanttParPersonne({ groupes, gantt, nomChantier, onCliquerTache }) {
  if (groupes.length === 0) {
    return (
      <p className="empty-state-description" style={{ margin: "8px 0" }}>
        Personne n'a de tâche datée ici.
      </p>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: gantt.largeurTotale + 180 }}>
        <EnteteMois gantt={gantt} />
        {groupes.map((groupe) => (
          <div key={groupe.nom} className="gantt-groupe">
            <div className="gantt-groupe-titre">{groupe.nom}</div>
            {groupe.taches.map((t, i) => (
              <LigneTache
                key={t.id + "-" + i}
                titre={t.chantierId ? nomChantier(t.chantierId) : "À affecter"}
                tache={t}
                gantt={gantt}
                onClick={() => onCliquerTache(t)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
