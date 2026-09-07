import { useEffect, useRef, useState } from "react";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useAuth } from "../contexts/AuthContext";

export default function ChatPanel({ chantierId }) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState("");
  const [envoiPhotoEnCours, setEnvoiPhotoEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const fileInputRef = useRef(null);
  const finListeRef = useRef(null);

  useEffect(() => {
    const q = query(
      collection(db, "messages"),
      where("chantierId", "==", chantierId),
      orderBy("creeLe", "asc")
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
  }, [chantierId]);

  useEffect(() => {
    finListeRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const envoyerTexte = async (e) => {
    e.preventDefault();
    const contenu = texte.trim();
    if (!contenu) return;
    setTexte("");
    await addDoc(collection(db, "messages"), {
      chantierId,
      userId: profile.id,
      userNom: profile.nom,
      texte: contenu,
      imageUrl: null,
      creeLe: serverTimestamp(),
    });
  };

  const envoyerPhoto = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur("");
    setEnvoiPhotoEnCours(true);
    try {
      const chemin = `chantiers/${chantierId}/chat/${Date.now()}-${fichier.name}`;
      const storageRef = ref(storage, chemin);
      await uploadBytes(storageRef, fichier);
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, "messages"), {
        chantierId,
        userId: profile.id,
        userNom: profile.nom,
        texte: "",
        imageUrl: url,
        creeLe: serverTimestamp(),
      });
    } catch (err) {
      setErreur("Erreur lors de l'envoi de la photo : " + err.message);
    } finally {
      setEnvoiPhotoEnCours(false);
      e.target.value = "";
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <p className="empty-state-description" style={{ textAlign: "center", marginTop: 20 }}>
            Aucun message pour l'instant. Écrivez le premier !
          </p>
        ) : (
          messages.map((m) => {
            const estMoi = m.userId === profile.id;
            return (
              <div
                key={m.id}
                className={"chat-bubble-row" + (estMoi ? " chat-bubble-row-moi" : "")}
              >
                <div className={"chat-bubble" + (estMoi ? " chat-bubble-moi" : "")}>
                  {!estMoi && <div className="chat-bubble-auteur">{m.userNom}</div>}
                  {m.imageUrl && (
                    <img
                      src={m.imageUrl}
                      alt="Photo envoyée dans le chat"
                      className="chat-bubble-image"
                      onClick={() => window.open(m.imageUrl, "_blank")}
                    />
                  )}
                  {m.texte && <div className="chat-bubble-texte">{m.texte}</div>}
                  <div className="chat-bubble-heure">{formatHeure(m.creeLe)}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={finListeRef} />
      </div>

      {erreur && <div className="form-error" style={{ margin: "0 16px 8px" }}>{erreur}</div>}
      {envoiPhotoEnCours && (
        <p className="page-loading" style={{ margin: "0 16px 8px" }}>
          Envoi de la photo…
        </p>
      )}

      <form className="chat-input-bar" onSubmit={envoyerTexte}>
        <button
          type="button"
          className="btn-ghost chat-photo-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={envoiPhotoEnCours}
          aria-label="Envoyer une photo"
        >
          📷
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={envoyerPhoto}
        />
        <input
          className="chat-text-input"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Écrire un message…"
        />
        <button type="submit" className="btn-primary" disabled={!texte.trim()}>
          Envoyer
        </button>
      </form>
    </div>
  );
}

function formatHeure(timestamp) {
  if (!timestamp?.toDate) return "";
  return timestamp.toDate().toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
