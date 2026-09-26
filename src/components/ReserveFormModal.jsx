import { useState } from "react";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

// Formulaire de création/modification d'une réserve. Utilisé depuis
// l'onglet Réserves d'un chantier (chantierId fixe, pas de sélecteur) et
// depuis la page Réserves globale (chantiers fourni, sélecteur affiché).
export default function ReserveFormModal({ chantierId, chantiers, reserve, utilisateurs, onClose }) {
  const [chantierChoisi, setChantierChoisi] = useState(reserve?.chantierId ?? chantierId ?? "");
  const [designation, setDesignation] = useState(reserve?.designation ?? "");
  const [responsable, setResponsable] = useState(reserve?.responsable ?? "");
  const [dateSignalement, setDateSignalement] = useState(
    reserve?.dateSignalement ?? new Date().toISOString().slice(0, 10)
  );
  const [dateEcheance, setDateEcheance] = useState(reserve?.dateEcheance ?? "");
  const [remarque, setRemarque] = useState(reserve?.remarque ?? "");
  const [enCours, setEnCours] = useState(false);

  const afficherSelecteurChantier = Array.isArray(chantiers);

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
    if (afficherSelecteurChantier) {
      donnees.chantierId = chantierChoisi || null;
    }
    if (reserve) {
      await updateDoc(doc(db, "reserves", reserve.id), donnees);
    } else {
      await addDoc(collection(db, "reserves"), {
        ...donnees,
        chantierId: afficherSelecteurChantier ? chantierChoisi || null : chantierId,
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
          {afficherSelecteurChantier && (
            <label>
              Chantier
              <select value={chantierChoisi} onChange={(e) => setChantierChoisi(e.target.value)}>
                <option value="">À affecter</option>
                {chantiers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.client ? c.client + " - " + c.nom : c.nom}
                  </option>
                ))}
              </select>
            </label>
          )}
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
            <textarea value={remarque} onChange={(e) => setRemarque(e.target.value)} rows={2} />
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
