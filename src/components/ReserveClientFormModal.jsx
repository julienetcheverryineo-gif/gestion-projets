import { useState } from "react";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ACCEPT_PJ, televerserPieces, verifierFichiers } from "../lib/piecesJointes";
import { creerNotification, TYPE_RESERVE_CLIENT } from "../lib/notifications";
import { libelleChantier } from "../lib/usePlanningData";

// Formulaire de saisie d'une réserve côté espace client : volontairement
// réduit aux champs utiles à un client (pas de responsable de levée, pas
// d'échéance — c'est l'équipe INEO qui pilote le traitement une fois la
// réserve reçue).
//
// `utilisateurs` est fourni par la page parente (EspaceClient), chargé dès
// l'arrivée sur la page plutôt qu'à l'ouverture de cette modale : un envoi
// rapide pouvait sinon partir avant la fin du tout premier chargement de la
// liste, laissant `notifierEquipe` sans personne à prévenir (silencieusement,
// aucune erreur ne remonte dans ce cas).
export default function ReserveClientFormModal({
  chantierId,
  chantier,
  nomSignalant,
  utilisateurs,
  onClose,
}) {
  const [designation, setDesignation] = useState("");
  const [remarque, setRemarque] = useState("");
  const [fichiers, setFichiers] = useState([]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const notifierEquipe = async () => {
    const destinataires = new Set();
    for (const u of utilisateurs || []) {
      const estResponsableEquipe = u.role === "admin" || u.role === "chef_de_projet";
      const estEquipeChantier =
        chantier?.automaticiens?.includes(u.nom) ||
        u.nom === chantier?.responsableChantier ||
        u.nom === chantier?.ra;
      if (estResponsableEquipe || estEquipeChantier) destinataires.add(u.id);
    }
    const libelle = chantier ? libelleChantier(chantier) : "un chantier";
    await Promise.all(
      [...destinataires].map((id) =>
        creerNotification({
          destinataireId: id,
          type: TYPE_RESERVE_CLIENT,
          titre: "Nouvelle réserve client",
          message: (nomSignalant || "Un client") + " a signalé : " + designation + " — " + libelle,
          lien: "/chantiers/" + chantierId,
        })
      )
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    const probleme = verifierFichiers(fichiers);
    if (probleme) return setErreur(probleme);
    setEnCours(true);
    try {
      const reference = doc(collection(db, "reserves"));
      const piecesJointes = await televerserPieces(reference.id, fichiers, nomSignalant);
      await setDoc(reference, {
        piecesJointes,
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
      await notifierEquipe();
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
          <label>
            Photos ou documents (facultatif)
            <input
              type="file"
              multiple
              accept={ACCEPT_PJ}
              onChange={(e) => setFichiers([...(e.target.files || [])])}
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
