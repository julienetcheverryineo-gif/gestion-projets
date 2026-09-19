import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../lib/firestoreHooks";

export default function ReservesGlobal() {
  const { documents: reserves, chargement } = useCollection("reserves");
  const { documents: chantiers } = useCollection("sites");
  const [filtre, setFiltre] = useState("ouvertes");
  const [groupeOuvert, setGroupeOuvert] = useState(null);

  const nomChantier = (id) => chantiers.find((c) => c.id === id)?.nom ?? "?";

  const basculerStatut = async (r) => {
    await updateDoc(doc(db, "reserves", r.id), {
      statut: r.statut === "levee" ? "ouverte" : "levee",
    });
  };

  const stats = useMemo(() => {
    const ouvertes = reserves.filter((r) => r.statut !== "levee").length;
    return { total: reserves.length, ouvertes, levees: reserves.length - ouvertes };
  }, [reserves]);

  const groupes = useMemo(() => {
    const reservesAffichees =
      filtre === "ouvertes"
        ? reserves.filter((r) => r.statut !== "levee")
        : filtre === "levees"
        ? reserves.filter((r) => r.statut === "levee")
        : reserves;

    const map = new Map();
    for (const r of reservesAffichees) {
      const cle = r.chantierId || "aaffecter";
      if (!map.has(cle)) map.set(cle, { cle, nom: nomChantier(r.chantierId), reserves: [] });
      map.get(cle).reserves.push(r);
    }
    return [...map.values()].sort((a, b) => b.reserves.length - a.reserves.length);
  }, [reserves, chantiers, filtre]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Réserves</h1>
        <p className="page-subtitle">Synthèse de toutes les réserves, tous chantiers confondus.</p>
      </header>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Réserves au total</div>
            </div>
            <div className={"stat-card" + (stats.ouvertes > 0 ? " stat-card-alerte" : "")}>
              <div className="stat-value">{stats.ouvertes}</div>
              <div className="stat-label">Ouvertes</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.levees}</div>
              <div className="stat-label">Levées</div>
            </div>
          </div>

          <div className="reserves-filtres" style={{ marginBottom: 16 }}>
            <button
              className={"page-tab" + (filtre === "ouvertes" ? " page-tab-active" : "")}
              onClick={() => setFiltre("ouvertes")}
            >
              Ouvertes
            </button>
            <button
              className={"page-tab" + (filtre === "levees" ? " page-tab-active" : "")}
              onClick={() => setFiltre("levees")}
            >
              Levées
            </button>
            <button
              className={"page-tab" + (filtre === "toutes" ? " page-tab-active" : "")}
              onClick={() => setFiltre("toutes")}
            >
              Toutes
            </button>
          </div>

          {groupes.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">Aucune réserve</p>
              <p className="empty-state-description">Rien à afficher pour ce filtre.</p>
            </div>
          ) : (
            <div className="lot-list">
              {groupes.map((g) => {
                const ouvert = groupeOuvert === g.cle;
                return (
                  <div key={g.cle} className="lot-card">
                    <div
                      className="lot-card-header"
                      onClick={() => setGroupeOuvert(ouvert ? null : g.cle)}
                    >
                      <div>
                        <span className="lot-card-toggle">{ouvert ? "▾" : "▸"}</span>
                        <strong>{g.nom}</strong>
                        <span className="simple-list-meta" style={{ marginLeft: 10 }}>
                          {g.reserves.length} réserve(s)
                        </span>
                      </div>
                      {g.cle !== "aaffecter" && (
                        <Link
                          to={"/chantiers/" + g.cle}
                          className="btn-ghost"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Ouvrir le chantier
                        </Link>
                      )}
                    </div>
                    {ouvert && (
                      <div className="lot-card-body">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Désignation</th>
                              <th>Responsable</th>
                              <th>Signalée le</th>
                              <th>Échéance</th>
                              <th>Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.reserves.map((r) => (
                              <tr key={r.id}>
                                <td data-label="Désignation" style={{ fontFamily: "var(--font-ui)" }}>
                                  {r.designation}
                                  {r.remarque && (
                                    <div className="simple-list-meta">{r.remarque}</div>
                                  )}
                                </td>
                                <td data-label="Responsable" style={{ fontFamily: "var(--font-ui)" }}>
                                  {r.responsable || "—"}
                                </td>
                                <td data-label="Signalée le">{r.dateSignalement || "—"}</td>
                                <td data-label="Échéance">{r.dateEcheance || "—"}</td>
                                <td data-label="Statut">
                                  <button
                                    className={
                                      "btn-ghost" + (r.statut === "levee" ? "" : " btn-danger")
                                    }
                                    onClick={() => basculerStatut(r)}
                                  >
                                    {r.statut === "levee" ? "Levée ✓" : "Ouverte"}
                                  </button>
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
        </>
      )}
    </div>
  );
}
