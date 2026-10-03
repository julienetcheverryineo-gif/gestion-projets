import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

// Formulaire de saisie d'une réserve côté espace client : volontairement
// réduit aux champs utiles à un client (pas de responsable de levée, pas
// d'échéance — c'est l'équipe INEO qui pilote le traitement une fois la
// réserve reçue).
export default function ReserveClientFormModal({ chantierId, nomSignalant, onClose }) {
  const [designation, setDesignation] = useState("");
  const [remarque, setRemarque] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      await addDoc(collection(db, "reserves"), {
        chantierId,
        designation,
        remarque: remarque || null,
        responsable: null,
        dateSignalement: new Date().toISOString().slice(0, 10),
        dateEcheance: null,
        signalePar: nomSignalant || null,
        statut: "ouverte",
        creeLe: serverTimestamp(),
      });
      onClose();
    } catch (err) {
      console.error("Erreur création de la réserve:", err);
      setErreur("Impossible d'enregistrer la réserve, réessayez dans un instant.");
      setEnCours(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Signaler une réserve</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Que constatez-vous ?
            <textarea
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="ex : Thermostat salle de réunion ne régule pas"
              rows={2}
              required
              autoFocus
            />
          </label>
          <label>
            Précisions (facultatif)
            <textarea
              value={remarque}
              onChange={(e) => setRemarque(e.target.value)}
              placeholder="Localisation précise, depuis quand, etc."
              rows={3}
            />
          </label>
          {erreur && <div className="form-error">{erreur}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
