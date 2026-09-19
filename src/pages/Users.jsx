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

const MOTS_SIMPLES = [
  "chantier",
  "bordeaux",
  "regulation",
  "capteur",
  "gtb",
  "automate",
  "sonde",
  "reseau",
];

function motDePasseFacileADicter() {
  const mot = MOTS_SIMPLES[Math.floor(Math.random() * MOTS_SIMPLES.length)];
  const chiffres = Math.floor(100 + Math.random() * 900);
  return mot.charAt(0).toUpperCase() + mot.slice(1) + chiffres + "!";
}

function messageErreurFirebase(err) {
  const code = err?.code || "inconnu";
  switch (code) {
    case "auth/email-already-in-use":
      return "Un compte existe déjà avec cet e-mail. (" + code + ")";
    case "auth/invalid-email":
      return "Adresse e-mail invalide. (" + code + ")";
    case "auth/weak-password":
      return "Mot de passe trop court (6 caractères minimum). (" + code + ")";
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

  const basculerActif = async (u) => {
    const nouveauStatut = u.actif === false ? true : false;
    if (
      !nouveauStatut &&
      !confirm(
        u.nom + " sera immédiatement déconnecté(e) et ne pourra plus se connecter. Continuer ?"
      )
    ) {
      return;
    }
    await updateDoc(doc(db, "users", u.id), { actif: nouveauStatut });
  };

  const reinitialiserMotDePasse = async (u) => {
    try {
      await sendPasswordResetEmail(auth, u.email);
      setMessageParUtilisateur((m) => ({ ...m, [u.id]: "E-mail envoyé ✓" }));
    } catch (err) {
      console.error("Erreur réinitialisation mot de passe:", err);
      setMessageParUtilisateur((m) => ({ ...m, [u.id]: messageErreurFirebase(err) }));
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
          <p className="page-subtitle">Gérez les rôles et l'accès de l'équipe.</p>
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
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.id} style={{ opacity: u.actif === false ? 0.5 : 1 }}>
                <td data-label="Nom">{u.nom}</td>
                <td data-label="E-mail">{u.email}</td>
                <td data-label="Rôle">
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
                <td data-label="Statut">
                  <button
                    className={"btn-ghost" + (u.actif === false ? "" : " btn-danger")}
                    onClick={() => basculerActif(u)}
                  >
                    {u.actif === false ? "Réactiver" : "Désactiver"}
                  </button>
                </td>
                <td>
                  {messageParUtilisateur[u.id] ? (
                    <span className="simple-list-meta">{messageParUtilisateur[u.id]}</span>
                  ) : (
                    <button className="btn-ghost" onClick={() => reinitialiserMotDePasse(u)}>
                      Envoyer un e-mail de reset
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
  const [password, setPassword] = useState(motDePasseFacileADicter());
  const [role, setRole] = useState("automaticien");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState(false);
  const [copie, setCopie] = useState(false);

  const copierMotDePasse = async () => {
    await navigator.clipboard.writeText(password);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    const secondaryAuth = getSecondaryAuth();
    let identifiants;
    try {
      identifiants = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    } catch (err) {
      console.error("Erreur création du compte Auth:", err);
      setErreur(messageErreurFirebase(err));
      setEnCours(false);
      return;
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
        actif: true,
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
    setSucces(true);
  };

  if (succes) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Compte créé ✓</h2>
          <p className="empty-state-description" style={{ margin: "0 0 14px" }}>
            Communiquez ces identifiants à {nom} à l'oral ou par un canal de votre choix.
          </p>
          <div className="credentials-box">
            <div>
              <span className="simple-list-meta">E-mail</span>
              <div>{email}</div>
            </div>
            <div>
              <span className="simple-list-meta">Mot de passe</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ fontFamily: "var(--font-mono)" }}>{password}</strong>
                <button type="button" className="btn-ghost" onClick={copierMotDePasse}>
                  {copie ? "Copié !" : "Copier"}
                </button>
              </div>
            </div>
          </div>
          <p className="empty-state-description" style={{ margin: "14px 0 0" }}>
            La personne pourra changer ce mot de passe elle-même plus tard si besoin.
          </p>
          <div className="modal-actions">
            <button className="btn-primary" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nouvel utilisateur</h2>
        <p className="empty-state-description" style={{ margin: "0 0 14px" }}>
          Vous définissez le mot de passe et le communiquez vous-même à la personne
          (oralement, par exemple) — plus fiable que l'envoi automatique par e-mail.
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
            Mot de passe
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                style={{ flex: 1, fontFamily: "var(--font-mono)" }}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setPassword(motDePasseFacileADicter())}
              >
                Générer
              </button>
            </div>
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
              {enCours ? "Création…" : "Créer le compte"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
