import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setErreur("Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand-mark" aria-hidden="true" />
        <h1>Pilotage de projets</h1>
        <p className="login-subtitle">Automatisme &amp; GTB</p>

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

          <button type="submit" className="btn-primary" disabled={enCours}>
            {enCours ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
