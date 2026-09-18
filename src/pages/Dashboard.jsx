import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "../lib/firestoreHooks";

export default function Dashboard() {
  const { documents: chantiers, chargement: chargementChantiers } =
    useCollection("sites");
  const { documents: taches, chargement: chargementTaches } =
    useCollection("tasks");
  const { documents: regEquipements } = useCollection("regequipements");
  const { documents: regItems } = useCollection("regitems");
  const { documents: reserves } = useCollection("reserves");

  const [inclureTerminees, setInclureTerminees] = useState(false);
  const [personneOuverte, setPersonneOuverte] = useState(null);

  const nomChantier = (id) => chantiers.find((c) => c.id === id)?.nom ?? "À affecter";
  const compteChantier = (id) => chantiers.find((c) => c.id === id)?.compte ?? "";

  // --- Tâches d'équipement régulé fusionnées avec les tâches classiques ---
  const tachesRegitems = useMemo(
    () =>
      regItems
        .filter((it) => it.type === "tache")
        .map((it) => {
          const equip = regEquipements.find((r) => r.id === it.regEquipementId);
          return {
            id: it.id,
            titre: it.designation + (equip ? " (" + equip.nom + ")" : ""),
            chantierId: equip?.chantierId ?? null,
            assigneA: it.assigneA || null,
            heuresPrevues: null,
            echeance: null,
            statut: it.statut === "fait" ? "termine" : "a_faire",
          };
        }),
    [regItems, regEquipements]
  );

  const toutesLesTaches = useMemo(
    () => [...taches, ...tachesRegitems],
    [taches, tachesRegitems]
  );

  const stats = useMemo(() => {
    const chantiersActifs = chantiers.filter((c) => c.statut !== "termine").length;
    const tachesEnRetard = toutesLesTaches.filter((t) => estEnRetard(t)).length;
    const tachesEnCours = toutesLesTaches.filter((t) => t.statut === "en_cours").length;
    const pointsRestants = regItems.filter(
      (it) => it.statut !== "teste" && it.statut !== "fait"
    ).length;
    const reservesOuvertes = reserves.filter((r) => r.statut !== "levee").length;
    const heuresPrevues = toutesLesTaches.reduce(
      (s, t) => s + Number(t.heuresPrevues || 0),
      0
    );
    return {
      chantiersActifs,
      tachesEnRetard,
      tachesEnCours,
      pointsRestants,
      reservesOuvertes,
      heuresPrevues,
    };
  }, [chantiers, toutesLesTaches, regItems, reserves]);

  const chargement = chargementChantiers || chargementTaches;

  const avancementChantier = (chantierId) => {
    const regsDuChantier = regEquipements.filter((r) => r.chantierId === chantierId);
    const items = regItems.filter((it) =>
      regsDuChantier.some((r) => r.id === it.regEquipementId)
    );
    if (items.length === 0) return null;
    const faits = items.filter((it) => it.statut === "teste" || it.statut === "fait").length;
    return Math.round((faits / items.length) * 100);
  };

  // --- Charge par automaticien ---
  const tachesRetenuesCharge = useMemo(
    () => toutesLesTaches.filter((t) => inclureTerminees || t.statut !== "termine"),
    [toutesLesTaches, inclureTerminees]
  );

  const parPersonne = useMemo(() => {
    const map = new Map();
    for (const t of tachesRetenuesCharge) {
      const nom = t.assigneA || "À affecter";
      if (!map.has(nom)) map.set(nom, { nom, taches: [], totalHeures: 0, chantiers: new Set() });
      const entree = map.get(nom);
      entree.taches.push(t);
      entree.totalHeures += Number(t.heuresPrevues || 0);
      if (t.chantierId) entree.chantiers.add(nomChantier(t.chantierId));
    }
    return [...map.values()].sort((a, b) => b.totalHeures - a.totalHeures);
  }, [tachesRetenuesCharge, chantiers]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Vue d'ensemble</h1>
        <p className="page-subtitle">Chantiers et charge d'équipe, en un coup d'œil.</p>
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
            <StatCard
              label="Réserves ouvertes"
              valeur={stats.reservesOuvertes}
              alerte={stats.reservesOuvertes > 0}
            />
            <StatCard label="Points restants" valeur={stats.pointsRestants} />
            <StatCard label="Heures prévues" valeur={stats.heuresPrevues} />
          </div>

          <div className="reg-item-columns">
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
                  description="Créez votre premier chantier pour commencer à suivre vos équipements régulés."
                  lienTexte="Créer un chantier"
                  lienVers="/chantiers"
                />
              ) : (
                <ul className="simple-list">
                  {chantiers
                    .filter((c) => c.statut !== "termine")
                    .slice(0, 8)
                    .map((c) => {
                      const pct = avancementChantier(c.id);
                      return (
                        <li key={c.id}>
                          <span className={"status-dot status-" + (c.statut ?? "actif")} />
                          <Link to={"/chantiers/" + c.id} className="simple-list-title">
                            {c.nom}
                          </Link>
                          <span className="simple-list-meta">
                            {pct !== null ? "Avancement : " + pct + "%" : "Sans équipement"}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>Charge par automaticien</h2>
              </div>
              <label className="export-filtre-checkbox" style={{ marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={inclureTerminees}
                  onChange={(e) => setInclureTerminees(e.target.checked)}
                />
                Inclure les tâches terminées
              </label>

              {parPersonne.length === 0 ? (
                <EmptyState
                  titre="Aucune tâche"
                  description="Les tâches créées apparaîtront ici, réparties par personne assignée."
                  lienTexte="Voir les tâches"
                  lienVers="/taches"
                />
              ) : (
                <div className="lot-list">
                  {parPersonne.map((p) => {
                    const ouvert = personneOuverte === p.nom;
                    return (
                      <div key={p.nom} className="lot-card">
                        <div
                          className="lot-card-header"
                          onClick={() => setPersonneOuverte(ouvert ? null : p.nom)}
                        >
                          <div>
                            <span className="lot-card-toggle">{ouvert ? "▾" : "▸"}</span>
                            <strong>{p.nom}</strong>
                            <span className="simple-list-meta" style={{ marginLeft: 10 }}>
                              {p.taches.length} tâche(s)
                            </span>
                          </div>
                          <span className="kanban-count">{p.totalHeures} h</span>
                        </div>

                        {ouvert && (
                          <div className="lot-card-body">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Chantier</th>
                                  <th>Tâche</th>
                                  <th>Compte</th>
                                  <th>Heures</th>
                                  <th>Date fin</th>
                                  <th>Statut</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.taches.map((t) => (
                                  <tr key={t.id}>
                                    <td style={{ fontFamily: "var(--font-ui)" }}>
                                      {t.chantierId ? (
                                        <Link to={"/chantiers/" + t.chantierId}>
                                          {nomChantier(t.chantierId)}
                                        </Link>
                                      ) : (
                                        "À affecter"
                                      )}
                                    </td>
                                    <td style={{ fontFamily: "var(--font-ui)" }}>{t.titre}</td>
                                    <td>{compteChantier(t.chantierId) || "—"}</td>
                                    <td>{t.heuresPrevues || "—"}</td>
                                    <td>{t.echeance || "—"}</td>
                                    <td style={{ fontFamily: "var(--font-ui)" }}>
                                      {formatStatutTache(t.statut)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {stats.tachesEnRetard > 0 && (
            <section className="panel panel-alert">
              <div className="panel-header">
                <h2>Tâches en retard</h2>
              </div>
              <ul className="simple-list">
                {toutesLesTaches
                  .filter((t) => estEnRetard(t))
                  .slice(0, 8)
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
