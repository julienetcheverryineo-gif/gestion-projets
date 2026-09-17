import { useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../lib/firestoreHooks";

export default function ReservesPanel({ chantierId, peutGerer, utilisateurs }) {
  const { documents: toutesReserves } = useCollection("reserves");
  const reserves = toutesReserves.filter((r) => r.chantierId === chantierId);
  const [afficherForm, setAfficherForm] = useState(false);
  const [reserveEnEdition, setReserveEnEdition] = useState(null);
  const [filtre, setFiltre] = useState("ouvertes");

  const ouvertes = reserves.filter((r) => r.statut !== "levee");
  const affichees =
    filtre === "ouvertes" ? ouvertes : filtre === "levees" ? reserves.filter((r) => r.statut === "levee") : reserves;

  const basculerStatut = async (r) => {
    await updateDoc(doc(db, "reserves", r.id), {
      statut: r.statut === "levee" ? "ouverte" : "levee",
    });
  };

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

      <div className="reserves-filtres">
        <button
          className={"page-tab" + (filtre === "ouvertes" ? " page-tab-active" : "")}
          onClick={() => setFiltre("ouvertes")}
        >
          Ouvertes ({ouvertes.length})
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
        <table className="data-table">
          <thead>
            <tr>
              <th>Désignation</th>
              <th>Responsable</th>
              <th>Signalée le</th>
              <th>Échéance</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {affichees.map((r) => (
              <tr key={r.id}>
                <td style={{ fontFamily: "var(--font-ui)" }}>
                  {r.designation}
                  {r.remarque && (
                    <div className="simple-list-meta">{r.remarque}</div>
                  )}
                </td>
                <td style={{ fontFamily: "var(--font-ui)" }}>{r.responsable || "—"}</td>
                <td>{r.dateSignalement || "—"}</td>
                <td>{r.dateEcheance || "—"}</td>
                <td>
                  <button
                    className={"btn-ghost" + (r.statut === "levee" ? "" : " btn-danger")}
                    onClick={() => basculerStatut(r)}
                  >
                    {r.statut === "levee" ? "Levée ✓" : "Ouverte"}
                  </button>
                </td>
                <td>
                  {peutGerer && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          setReserveEnEdition(r);
                          setAfficherForm(true);
                        }}
                      >
                        Modifier
                      </button>
                      <button className="btn-ghost btn-danger" onClick={() => supprimer(r.id)}>
                        ×
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function ReserveFormModal({ chantierId, reserve, utilisateurs, onClose }) {
  const [designation, setDesignation] = useState(reserve?.designation ?? "");
  const [responsable, setResponsable] = useState(reserve?.responsable ?? "");
  const [dateSignalement, setDateSignalement] = useState(
    reserve?.dateSignalement ?? new Date().toISOString().slice(0, 10)
  );
  const [dateEcheance, setDateEcheance] = useState(reserve?.dateEcheance ?? "");
  const [remarque, setRemarque] = useState(reserve?.remarque ?? "");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    const donnees = {
      designation,
      responsable: responsable || null,
      dateSignalement: dateSignalement || null,
      dateEcheance: dateEcheance || null,
      remarque: remarque || null,
    };
    if (reserve) {
      await updateDoc(doc(db, "reserves", reserve.id), donnees);
    } else {
      await addDoc(collection(db, "reserves"), {
        ...donnees,
        chantierId,
        statut: "ouverte",
        creeLe: serverTimestamp(),
      });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{reserve ? "Modifier la réserve" : "Nouvelle réserve"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Désignation
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="ex : Sonde CTA1 mal câblée"
              required
            />
          </label>
          <label>
            Responsable de la levée
            <select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
              <option value="">—</option>
              {utilisateurs.map((u) => (
                <option key={u.id} value={u.nom}>
                  {u.nom}
                </option>
              ))}
            </select>
          </label>
          <div className="form-inline">
            <label>
              Signalée le
              <input
                type="date"
                value={dateSignalement}
                onChange={(e) => setDateSignalement(e.target.value)}
              />
            </label>
            <label>
              Échéance
              <input
                type="date"
                value={dateEcheance}
                onChange={(e) => setDateEcheance(e.target.value)}
              />
            </label>
          </div>
          <label>
            Remarque
            <textarea
              value={remarque}
              onChange={(e) => setRemarque(e.target.value)}
              rows={2}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
