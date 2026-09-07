import { useState } from "react";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { db, auth, getSecondaryAuth } from "../firebase";
import { useCollection } from "../lib/firestoreHooks";

const ROLES = [
  { value: "automaticien", label: "Automaticien" },
  { value: "electricien", label: "Électricien" },
  { value: "chef_de_projet", label: "Chef de projet" },
  { value: "admin", label: "Administrateur" },
];

function motDePasseTemporaire() {
  // Jamais communiqué : le compte est créé puis un e-mail de définition de
  // mot de passe est envoyé immédiatement après.
  const alea =
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)) + "Aa1!";
  return alea;
}

function messageErreurFirebase(err) {
  const code = err?.code || "inconnu";
  switch (code) {
    case "auth/email-already-in-use":
      return "Un compte existe déjà avec cet e-mail. (" + code + ")";
    case "auth/invalid-email":
      return "Adresse e-mail invalide. (" + code + ")";
    case "auth/operation-not-allowed":
      return "La connexion par e-mail/mot de passe n'est pas activée dans Firebase Authentication. (" + code + ")";
    case "auth/network-request-failed":
      return "Problème réseau, réessayez. (" + code + ")";
    default:
      return "Erreur : " + (err?.message || code) + " (" + code + ")";
  }
}

export default function Users() {
  const { documents: utilisateurs, chargement } = useCollection("users", "email");
  const [afficherAjout, setAfficherAjout] = useState(false);
  const [messageParUtilisateur, setMessageParUtilisateur] = useState({});

  const changerRole = async (userId, role) => {
    await updateDoc(doc(db, "users", userId), { role });
  };

  const reinitialiserMotDePasse = async (u) => {
    try {
      await sendPasswordResetEmail(auth, u.email);
      setMessageParUtilisateur((m) => ({ ...m, [u.id]: "E-mail envoyé ✓" }));
    } catch (err) {
      console.error("Erreur réinitialisation mot de passe:", err);
      setMessageParUtilisateur((m) => ({
        ...m,
        [u.id]: messageErreurFirebase(err),
      }));
    }
    setTimeout(() => {
      setMessageParUtilisateur((m) => ({ ...m, [u.id]: undefined }));
    }, 6000);
  };

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1>Utilisateurs</h1>
          <p className="page-subtitle">Gérez les rôles de l'équipe.</p>
        </div>
        <button className="btn-primary" onClick={() => setAfficherAjout(true)}>
          + Ajouter un utilisateur
        </button>
      </header>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>E-mail</th>
              <th>Rôle</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.id}>
                <td>{u.nom}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => changerRole(u.id, e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {messageParUtilisateur[u.id] ? (
                    <span className="simple-list-meta">{messageParUtilisateur[u.id]}</span>
                  ) : (
                    <button className="btn-ghost" onClick={() => reinitialiserMotDePasse(u)}>
                      Réinitialiser le mot de passe
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {afficherAjout && <AddUserModal onClose={() => setAfficherAjout(false)} />}
    </div>
  );
}

function AddUserModal({ onClose }) {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("automaticien");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    const secondaryAuth = getSecondaryAuth();
    let identifiants;
    try {
      identifiants = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        motDePasseTemporaire()
      );
    } catch (err) {
      console.error("Erreur création du compte Auth:", err);
      setErreur(messageErreurFirebase(err));
      setEnCours(false);
      return;
    }

    let avertissement = "";
    try {
      await sendPasswordResetEmail(secondaryAuth, email);
    } catch (err) {
      console.error("Erreur envoi de l'e-mail d'invitation:", err);
      avertissement =
        "Le compte a été créé mais l'e-mail n'a pas pu être envoyé : " +
        messageErreurFirebase(err) +
        " — utilisez \"Réinitialiser le mot de passe\" une fois fermé pour réessayer.";
      setErreur(avertissement);
    }

    try {
      await signOut(secondaryAuth);
    } catch (err) {
      console.error("Erreur déconnexion instance secondaire:", err);
    }

    try {
      await setDoc(doc(db, "users", identifiants.user.uid), {
        nom,
        email,
        role,
        creeLe: serverTimestamp(),
      });
    } catch (err) {
      console.error("Erreur création du profil Firestore:", err);
      setErreur(
        "Le compte de connexion a été créé, mais le profil n'a pas pu être enregistré : " +
          messageErreurFirebase(err)
      );
      setEnCours(false);
      return;
    }

    setEnCours(false);
    if (!avertissement) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nouvel utilisateur</h2>
        <p className="empty-state-description" style={{ margin: "0 0 14px" }}>
          Un e-mail sera envoyé à la personne pour qu'elle définisse elle-même son mot de
          passe.
        </p>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Nom
            <input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Rôle
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {erreur && <div className="form-error">{erreur}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Création…" : "Créer et envoyer l'invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
