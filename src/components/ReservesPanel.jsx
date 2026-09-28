import { useState } from "react";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../lib/firestoreHooks";
import ReservesTablePlat from "./ReservesTablePlat";
import ReserveFormModal from "./ReserveFormModal";

export default function ReservesPanel({ chantierId, peutGerer, utilisateurs }) {
  const { documents: toutesReserves } = useCollection("reserves");
  const reserves = toutesReserves.filter((r) => r.chantierId === chantierId);
  const [afficherForm, setAfficherForm] = useState(false);
  const [reserveEnEdition, setReserveEnEdition] = useState(null);
  const [filtre, setFiltre] = useState("ouvertes");

  const ouvertes = reserves.filter((r) => r.statut !== "levee");
  const affichees =
    filtre === "ouvertes" ? ouvertes : filtre === "levees" ? reserves.filter((r) => r.statut === "levee") : reserves;

  const supprimer = async (id) => {
    if (!confirm("Supprimer cette réserve ?")) return;
    await deleteDoc(doc(db, "reserves", id));
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Levées de réserves</h2>
        {peutGerer && (
          <button
            className="btn-ghost"
            onClick={() => {
              setReserveEnEdition(null);
              setAfficherForm(true);
            }}
          >
            + Ajouter une réserve
          </button>
        )}
      </div>

      <div className="chantier-actions-bar">
        <button
          className={filtre === "ouvertes" ? "btn-primary" : "btn-accent"}
          onClick={() => setFiltre("ouvertes")}
        >
          Ouvertes ({ouvertes.length})
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

      {affichees.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucune réserve</p>
          <p className="empty-state-description">
            {filtre === "ouvertes"
              ? "Aucune réserve ouverte pour l'instant."
              : "Rien à afficher pour ce filtre."}
          </p>
        </div>
      ) : (
        <ReservesTablePlat
          reserves={affichees}
          peutGerer={peutGerer}
          afficherChantier={false}
          nomChantier={() => ""}
          onModifier={(r) => {
            setReserveEnEdition(r);
            setAfficherForm(true);
          }}
          onSupprimer={supprimer}
        />
      )}

      {afficherForm && (
        <ReserveFormModal
          chantierId={chantierId}
          reserve={reserveEnEdition}
          utilisateurs={utilisateurs}
          onClose={() => setAfficherForm(false)}
        />
      )}
    </section>
  );
}
