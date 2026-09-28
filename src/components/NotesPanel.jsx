import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";

function formatDateHeure(ts) {
  if (!ts?.toDate) return "";
  const d = ts.toDate();
  return (
    d.toLocaleDateString("fr-FR") +
    " à " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  );
}

// Notes libres, horodatées et attribuées à leur auteur. Une même collection
// `notes` sert pour les deux usages : `chantierId` renseigné pour l'onglet
// Notes d'un chantier, ou `null` pour les notes générales (panneau à
// droite, accessible depuis n'importe quelle page). Toujours triées de la
// plus récente à la plus ancienne (tri par défaut de useCollection).
// Modifiable/supprimable par son auteur, ou par un admin/chef de projet.
export default function NotesPanel({ chantierId = null, texteVide = "Aucune note pour l'instant." }) {
  const { user, profile, isAdmin, isChefDeProjet } = useAuth();
  const { documents: toutesLesNotes, chargement } = useCollection("notes");
  const [texteNouvelleNote, setTexteNouvelleNote] = useState("");
  const [enAjout, setEnAjout] = useState(false);

  const notes = toutesLesNotes.filter((n) => (n.chantierId || null) === chantierId);

  const ajouter = async () => {
    const texte = texteNouvelleNote.trim();
    if (!texte) return;
    setEnAjout(true);
    try {
      await addDoc(collection(db, "notes"), {
        chantierId,
        texte,
        userId: user?.uid || null,
        auteur: profile?.nom || "?",
        creeLe: serverTimestamp(),
        modifieLe: serverTimestamp(),
      });
      setTexteNouvelleNote("");
    } finally {
      setEnAjout(false);
    }
  };

  const modifier = async (note, texte) => {
    if (texte === note.texte || !texte) return;
    await updateDoc(doc(db, "notes", note.id), { texte, modifieLe: serverTimestamp() });
  };

  const supprimer = async (note) => {
    if (!confirm("Supprimer cette note ?")) return;
    await deleteDoc(doc(db, "notes", note.id));
  };

  const peutModifier = (note) => isAdmin || isChefDeProjet || note.userId === user?.uid;

  return (
    <div className="notes-panel">
      <div className="notes-ajout">
        <textarea
          className="notes-textarea"
          placeholder="Écrire une note…"
          value={texteNouvelleNote}
          onChange={(e) => setTexteNouvelleNote(e.target.value)}
          rows={3}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={ajouter}
          disabled={enAjout || !texteNouvelleNote.trim()}
        >
          Ajouter
        </button>
      </div>

      {chargement ? (
        <p className="page-loading">Chargement…</p>
      ) : notes.length === 0 ? (
        <p className="empty-state-description" style={{ margin: "10px 0" }}>
          {texteVide}
        </p>
      ) : (
        <div className="notes-liste">
          {notes.map((note) => (
            <div key={note.id} className="note-carte">
              <div className="note-carte-entete">
                <span className="note-auteur">{note.auteur}</span>
                <span className="simple-list-meta">{formatDateHeure(note.creeLe)}</span>
                {peutModifier(note) && (
                  <button
                    type="button"
                    className="btn-ghost btn-danger note-supprimer"
                    onClick={() => supprimer(note)}
                    aria-label="Supprimer la note"
                  >
                    ×
                  </button>
                )}
              </div>
              {peutModifier(note) ? (
                <textarea
                  className="note-texte-edit"
                  defaultValue={note.texte}
                  onBlur={(e) => modifier(note, e.target.value.trim())}
                />
              ) : (
                <p className="note-texte">{note.texte}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
