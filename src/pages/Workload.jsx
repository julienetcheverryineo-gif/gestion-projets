import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "../lib/firestoreHooks";

export default function Workload() {
  const { documents: taches, chargement } = useCollection("tasks");
  const { documents: chantiers } = useCollection("sites");
  const [inclureTerminees, setInclureTerminees] = useState(false);
  const [personneOuverte, setPersonneOuverte] = useState(null);

  const nomChantier = (id) => chantiers.find((c) => c.id === id)?.nom ?? "À affecter";
  const compteChantier = (id) => chantiers.find((c) => c.id === id)?.compte ?? "";

  const tachesRetenues = useMemo(
    () => taches.filter((t) => inclureTerminees || t.statut !== "termine"),
    [taches, inclureTerminees]
  );

  const parPersonne = useMemo(() => {
    const map = new Map();
    for (const t of tachesRetenues) {
      const nom = t.assigneA || "À affecter";
      if (!map.has(nom)) map.set(nom, { nom, taches: [], totalHeures: 0, chantiers: new Set() });
      const entree = map.get(nom);
      entree.taches.push(t);
      entree.totalHeures += Number(t.heuresPrevues || 0);
      if (t.chantierId) entree.chantiers.add(nomChantier(t.chantierId));
    }
    return [...map.values()].sort((a, b) => b.totalHeures - a.totalHeures);
  }, [tachesRetenues, chantiers]);

  const totalGeneral = parPersonne.reduce((s, p) => s + p.totalHeures, 0);

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1>Plan de charge</h1>
          <p className="page-subtitle">
            Répartition des tâches et des heures prévues par automaticien.
          </p>
        </div>
        <label className="export-filtre-checkbox">
          <input
            type="checkbox"
            checked={inclureTerminees}
            onChange={(e) => setInclureTerminees(e.target.checked)}
          />
          Inclure les tâches terminées
        </label>
      </header>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value">{parPersonne.length}</div>
              <div className="stat-label">Personnes avec des tâches</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{tachesRetenues.length}</div>
              <div className="stat-label">Tâches</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalGeneral}</div>
              <div className="stat-label">Heures prévues au total</div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-header">
              <h2>Synthèse par automaticien</h2>
            </div>
            {parPersonne.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">Aucune tâche</p>
                <p className="empty-state-description">
                  Les tâches créées dans l'onglet "Tâches" apparaîtront ici, réparties par
                  personne assignée.
                </p>
              </div>
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
                            {p.taches.length} tâche(s) · {[...p.chantiers].join(", ") || "—"}
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
        </>
      )}
    </div>
  );
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
