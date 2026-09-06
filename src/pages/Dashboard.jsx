import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "../lib/firestoreHooks";

export default function Dashboard() {
  const { documents: projets, chargement: chargementProjets } =
    useCollection("projects");
  const { documents: taches, chargement: chargementTaches } =
    useCollection("tasks");

  const stats = useMemo(() => {
    const projetsActifs = projets.filter((p) => p.statut !== "termine").length;
    const tachesEnRetard = taches.filter((t) => estEnRetard(t)).length;
    const tachesEnCours = taches.filter((t) => t.statut === "en_cours").length;
    const tachesTerminees = taches.filter((t) => t.statut === "termine").length;
    return { projetsActifs, tachesEnRetard, tachesEnCours, tachesTerminees };
  }, [projets, taches]);

  const chargement = chargementProjets || chargementTaches;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Vue d'ensemble</h1>
        <p className="page-subtitle">Où en sont vos projets, en un coup d'œil.</p>
      </header>

      {chargement ? (
        <div className="page-loading">Chargement des données…</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Projets actifs" valeur={stats.projetsActifs} />
            <StatCard label="Tâches en cours" valeur={stats.tachesEnCours} />
            <StatCard
              label="Tâches en retard"
              valeur={stats.tachesEnRetard}
              alerte={stats.tachesEnRetard > 0}
            />
            <StatCard label="Tâches terminées" valeur={stats.tachesTerminees} />
          </div>

          <section className="panel">
            <div className="panel-header">
              <h2>Projets récents</h2>
              <Link to="/projets" className="link">
                Voir tous les projets
              </Link>
            </div>
            {projets.length === 0 ? (
              <EmptyState
                titre="Aucun projet pour l'instant"
                description="Créez votre premier projet pour commencer à organiser les tâches de l'équipe."
                lienTexte="Créer un projet"
                lienVers="/projets"
              />
            ) : (
              <ul className="simple-list">
                {projets.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <span className={"status-dot status-" + (p.statut ?? "actif")} />
                    <span className="simple-list-title">{p.nom}</span>
                    <span className="simple-list-meta">
                      {p.echeance ? "Échéance : " + p.echeance : "Sans échéance"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {stats.tachesEnRetard > 0 && (
            <section className="panel panel-alert">
              <div className="panel-header">
                <h2>Tâches en retard</h2>
              </div>
              <ul className="simple-list">
                {taches
                  .filter((t) => estEnRetard(t))
                  .slice(0, 5)
                  .map((t) => (
                    <li key={t.id}>
                      <span className="status-dot status-retard" />
                      <span className="simple-list-title">{t.titre}</span>
                      <span className="simple-list-meta">
                        Échéance dépassée : {t.echeance}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function estEnRetard(tache) {
  if (!tache.echeance || tache.statut === "termine") return false;
  return new Date(tache.echeance) < new Date(new Date().toDateString());
}

function StatCard({ label, valeur, alerte }) {
  return (
    <div className={"stat-card" + (alerte ? " stat-card-alerte" : "")}>
      <div className="stat-value">{valeur}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function EmptyState({ titre, description, lienTexte, lienVers }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{titre}</p>
      <p className="empty-state-description">{description}</p>
      <Link to={lienVers} className="btn-primary">
        {lienTexte}
      </Link>
    </div>
  );
}
