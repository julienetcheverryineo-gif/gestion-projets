import { useState } from "react";
import { collection, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { ACCEPT_PJ, televerserPieces, verifierFichiers } from "../lib/piecesJointes";
import PiecesJointesReserve from "./PiecesJointesReserve";
import { useCollection } from "../lib/firestoreHooks";

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
  const [actionLevee, setActionLevee] = useState(reserve?.actionLevee ?? "");
  const [nouveauxFichiers, setNouveauxFichiers] = useState([]);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const { profile } = useAuth();
  // Réserve ouverte pour modification : on suit la version à jour pour que
  // les pièces ajoutées/retirées s'affichent tout de suite.
  const { documents: reservesLive } = useCollection("reserves");
  const reserveCourante = reserve ? reservesLive.find((r) => r.id === reserve.id) ?? reserve : null;

  const afficherSelecteurChantier = Array.isArray(chantiers);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    const probleme = verifierFichiers(nouveauxFichiers);
    if (probleme) return setErreur(probleme);
    setEnCours(true);
    try {
      const donnees = {
        designation,
        responsable: responsable || null,
        dateSignalement: dateSignalement || null,
        dateEcheance: dateEcheance || null,
        remarque: remarque || null,
        actionLevee: actionLevee || null,
      };
      if (afficherSelecteurChantier) {
        donnees.chantierId = chantierChoisi || null;
      }
      if (reserve) {
        await updateDoc(doc(db, "reserves", reserve.id), donnees);
      } else {
        const reference = doc(collection(db, "reserves"));
        const piecesJointes = await televerserPieces(reference.id, nouveauxFichiers, profile?.nom);
        await setDoc(reference, {
          ...donnees,
          chantierId: afficherSelecteurChantier ? chantierChoisi || null : chantierId,
          statut: "ouverte",
          piecesJointes,
          creeLe: serverTimestamp(),
        });
      }
      onClose();
    } catch (err) {
      setErreur("Enregistrement impossible : " + (err.message || err));
      setEnCours(false);
    }
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
          <label>
            Action menée pour lever la réserve
            <textarea
              value={actionLevee}
              onChange={(e) => setActionLevee(e.target.value)}
              rows={3}
              placeholder="ex : Sonde recâblée et testée, PV signé le …"
            />
          </label>
          <div>
            <div style={{ marginBottom: 4 }}>Pièces jointes</div>
            {reserveCourante ? (
              <PiecesJointesReserve
                reserveId={reserveCourante.id}
                pieces={reserveCourante.piecesJointes || []}
                peutAjouter
                peutRetirer
                auteur={profile?.nom}
              />
            ) : (
              <>
                <input
                  type="file"
                  multiple
                  accept={ACCEPT_PJ}
                  onChange={(e) => setNouveauxFichiers([...(e.target.files || [])])}
                />
                {nouveauxFichiers.length > 0 && (
                  <div className="simple-list-meta">{nouveauxFichiers.length} fichier(s) joint(s) à l'enregistrement</div>
                )}
              </>
            )}
          </div>
          {erreur && <div className="form-error">{erreur}</div>}
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
