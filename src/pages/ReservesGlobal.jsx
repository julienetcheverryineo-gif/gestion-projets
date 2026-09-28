import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../lib/firestoreHooks";
import { useAuth } from "../contexts/AuthContext";
import { libelleChantier } from "../lib/usePlanningData";
import ReservesTablePlat from "../components/ReservesTablePlat";
import ReserveFormModal from "../components/ReserveFormModal";

export default function ReservesGlobal() {
  const { isAdmin, isChefDeProjet } = useAuth();
  const peutGerer = isAdmin || isChefDeProjet;
  const { documents: reserves, chargement } = useCollection("reserves");
  const { documents: chantiers } = useCollection("sites");
  const { documents: utilisateurs } = useCollection("users", "email");
  const [filtre, setFiltre] = useState("ouvertes");
  const [groupeOuvert, setGroupeOuvert] = useState(null);
  const [vue, setVue] = useState("plat");
  const [reserveEnEdition, setReserveEnEdition] = useState(null);
  const [afficherForm, setAfficherForm] = useState(false);

  const chantierParId = (id) => chantiers.find((c) => c.id === id);
  const nomChantier = (id) => libelleChantier(chantierParId(id));

  const supprimer = async (id) => {
    if (!confirm("Supprimer cette réserve ?")) return;
    await deleteDoc(doc(db, "reserves", id));
  };

  const reservesAffichees = useMemo(
    () =>
      filtre === "ouvertes"
        ? reserves.filter((r) => r.statut !== "levee")
        : filtre === "levees"
        ? reserves.filter((r) => r.statut === "levee")
        : reserves,
    [reserves, filtre]
  );

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
      <header className="page-header page-header-actions">
        <div>
          <h1>Réserves</h1>
          <p className="page-subtitle">Synthèse de toutes les réserves, tous chantiers confondus.</p>
        </div>
        {peutGerer && (
          <button
            className="btn-primary"
            onClick={() => {
              setReserveEnEdition(null);
              setAfficherForm(true);
            }}
          >
            + Ajouter une réserve
          </button>
        )}
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

          <div className="chantier-actions-bar" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className={filtre === "ouvertes" ? "btn-primary" : "btn-accent"}
                onClick={() => setFiltre("ouvertes")}
              >
                Ouvertes
              </button>
              <button
                className={filtre === "levees" ? "btn-primary" : "btn-accent"}
                onClick={() => setFiltre("levees")}
              >
                Levées
              </button>
              <button
                className={filtre === "toutes" ? "btn-primary" : "btn-accent"}
                onClick={() => setFiltre("toutes")}
              >
                Toutes
              </button>
            </div>
            <button
              className="btn-accent"
              onClick={() => setVue(vue === "plat" ? "groupe" : "plat")}
            >
              {vue === "plat" ? "Grouper par chantier" : "Vue à plat"}
            </button>
          </div>

          {vue === "plat" ? (
            <ReservesTablePlat
              reserves={reservesAffichees}
              peutGerer={peutGerer}
              afficherChantier
              nomChantier={nomChantier}
              onModifier={(r) => {
                setReserveEnEdition(r);
                setAfficherForm(true);
              }}
              onSupprimer={supprimer}
            />
          ) : groupes.length === 0 ? (
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
                        <ReservesTablePlat
                          reserves={g.reserves}
                          peutGerer={peutGerer}
                          afficherChantier={false}
                          nomChantier={nomChantier}
                          onModifier={(r) => {
                            setReserveEnEdition(r);
                            setAfficherForm(true);
                          }}
                          onSupprimer={supprimer}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {afficherForm && (
        <ReserveFormModal
          chantierId={reserveEnEdition?.chantierId ?? null}
          chantiers={chantiers}
          reserve={reserveEnEdition}
          utilisateurs={utilisateurs}
          onClose={() => setAfficherForm(false)}
        />
      )}
    </div>
  );
}
