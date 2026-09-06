import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "../lib/firestoreHooks";

export default function Dashboard() {
  const { documents: chantiers, chargement: chargementChantiers } =
    useCollection("sites");
  const { documents: taches, chargement: chargementTaches } =
    useCollection("tasks");
  const { documents: lots } = useCollection("lots");
  const { documents: equipements } = useCollection("equipments");

  const stats = useMemo(() => {
    const chantiersActifs = chantiers.filter((c) => c.statut !== "termine").length;
    const tachesEnRetard = taches.filter((t) => estEnRetard(t)).length;
    const tachesEnCours = taches.filter((t) => t.statut === "en_cours").length;
    const equipementsRestants = equipements.filter((e) => e.statut !== "teste").length;
    return { chantiersActifs, tachesEnRetard, tachesEnCours, equipementsRestants };
  }, [chantiers, taches, equipements]);

  const chargement = chargementChantiers || chargementTaches;

  const avancementChantier = (chantierId) => {
    const lotsDuChantier = lots.filter((l) => l.chantierId === chantierId);
    const eqs = equipements.filter((e) =>
      lotsDuChantier.some((l) => l.id === e.lotId)
    );
    if (eqs.length === 0) return null;
    const testes = eqs.filter((e) => e.statut === "teste").length;
    return Math.round((testes / eqs.length) * 100);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Vue d'ensemble</h1>
        <p className="page-subtitle">Où en sont vos chantiers, en un coup d'œil.</p>
      </header>

      {chargement ? (
        <div className="page-loading">Chargement des données…</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Chantiers actifs" valeur={stats.chantiersActifs} />
            <StatCard label="Tâches en cours" valeur={stats.tachesEnCours} />
            <StatCard
              label="Tâches en retard"
              valeur={stats.tachesEnRetard}
              alerte={stats.tachesEnRetard > 0}
            />
            <StatCard label="Points restants" valeur={stats.equipementsRestants} />
          </div>

          <section className="panel">
            <div className="panel-header">
              <h2>Chantiers</h2>
              <Link to="/chantiers" className="link">
                Voir tous les chantiers
              </Link>
            </div>
            {chantiers.length === 0 ? (
              <EmptyState
                titre="Aucun chantier pour l'instant"
                description="Créez votre premier chantier pour commencer à suivre les lots techniques."
                lienTexte="Créer un chantier"
                lienVers="/chantiers"
              />
            ) : (
              <ul className="simple-list">
                {chantiers.slice(0, 6).map((c) => {
                  const pct = avancementChantier(c.id);
                  return (
                    <li key={c.id}>
                      <span className={"status-dot status-" + (c.statut ?? "actif")} />
                      <Link to={"/chantiers/" + c.id} className="simple-list-title">
                        {c.nom}
                      </Link>
                      <span className="simple-list-meta">
                        {pct !== null ? "Avancement : " + pct + "%" : "Sans lot"}
                      </span>
                    </li>
                  );
                })}
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
