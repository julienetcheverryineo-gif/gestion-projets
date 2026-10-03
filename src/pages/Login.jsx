import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import logoIneo from "../assets/logo-ineo.png";

export default function Login() {
  const { user, profile, login, compteDesactive } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  // Ne pas naviguer juste après la résolution de login() : à ce moment-là,
  // AuthContext n'a pas encore fini de charger le profil Firestore (c'est
  // asynchrone, dans onAuthStateChanged), donc `user` est encore `null` et
  // ProtectedRoute nous aurait renvoyés direct vers /connexion — obligeant
  // à se reconnecter une seconde fois pour que ça "prenne". On navigue
  // plutôt dès que le contexte confirme que l'utilisateur est authentifié.
  // Le RA Électricité arrive directement dans l'espace Électricité, un
  // compte client dans son espace dédié (réserves) ; les autres profils
  // sur le tableau de bord Automatisme & GTB comme avant.
  useEffect(() => {
    if (user) {
      const destination =
        profile?.role === "ra_electricite"
          ? "/electricite"
          : profile?.role === "client"
            ? "/espace-client"
            : "/";
      navigate(destination, { replace: true });
    }
  }, [user, profile, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      await login(email, password);
    } catch (err) {
      setErreur("Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo-chip logo-chip-lg">
          <img src={logoIneo} alt="INEO — une marque d'EQUANS" />
        </div>
        <h1>Pilotage de projets</h1>
        <p className="login-subtitle">Électricité, Automatisme &amp; GTB</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {erreur && <div className="form-error">{erreur}</div>}
          {compteDesactive && (
            <div className="form-error">
              Ce compte a été désactivé. Contactez votre administrateur.
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={enCours}>
            {enCours ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
