import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useCollection } from "../../lib/firestoreHooks";
import { nettoyerHtmlNote } from "../../lib/sanitizeHtml";
import { ecrire } from "../../lib/ecritureMobile";
import { afficherToast } from "../../components/mobile/Ui";
import { IcNote } from "../../components/mobile/Icones";

const echapper = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function dateHeure(ts) {
  if (!ts?.toDate) return "à l'instant";
  const d = ts.toDate();
  return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Notes de visite d'un chantier : on tape, on envoie, même sans réseau.
export default function NotesAuto({ chantierId }) {
  const { user, profile } = useAuth();
  const { documents: toutes } = useCollection("notes");
  const [texte, setTexte] = useState("");
  const notes = toutes.filter((n) => (n.chantierId || null) === chantierId && !n.portee);

  const ajouter = () => {
    const brut = texte.trim();
    if (!brut) return;
    const html = "<p>" + echapper(brut).replace(/\n/g, "<br>") + "</p>";
    ecrire(
      addDoc(collection(db, "notes"), {
        chantierId,
        texte: nettoyerHtmlNote(html),
        userId: user?.uid || null,
        auteur: profile?.nom || "?",
        creeLe: serverTimestamp(),
        modifieLe: serverTimestamp(),
      })
    );
    setTexte("");
    afficherToast("Note enregistrée");
  };

  return (
    <div>
      <div className="m-carte-blanche m-note-saisie">
        <textarea rows={3} placeholder="Écrire une note de visite…" value={texte} onChange={(e) => setTexte(e.target.value)} />
        <button type="button" className="m-bouton-plein" disabled={!texte.trim()} onClick={ajouter}>
          Ajouter la note
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="m-vide">
          <IcNote taille={34} />
          <strong>Aucune note</strong>
        </div>
      ) : (
        <ul className="m-liste-simple">
          {notes.map((n) => (
            <li key={n.id} className="m-note-auto">
              <div className="m-note-auto-tete">
                <strong>{n.auteur}</strong>
                <span>{dateHeure(n.creeLe)}</span>
              </div>
              <div className="m-note-auto-texte" dangerouslySetInnerHTML={{ __html: nettoyerHtmlNote(n.texte) }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
