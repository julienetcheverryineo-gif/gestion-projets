import { useAuth } from "../contexts/AuthContext";

// Espace de départ du service Électricité : volontairement vide pour
// l'instant. Contrairement aux autres profils (automaticien, chef de
// projet, admin...), qui continuent de voir l'interface Automatisme &
// GTB existante, le profil "RA Électricité" atterrit ici et n'a accès
// qu'à cette zone — prête à être construite au fil des besoins décrits
// par Julien, sans rien mélanger avec les données Automatisme.
export default function ElectriciteAccueil() {
  const { profile } = useAuth();

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Électricité</h1>
          <p className="page-subtitle">Bonjour {profile?.nom || ""}.</p>
        </div>
      </header>

      <div className="empty-state">
        <p className="empty-state-title">C'est à construire</p>
        <p className="empty-state-description">
          Cet espace est prêt à accueillir le suivi des chantiers électricité, en partant de
          zéro et indépendamment de l'Automatisme &amp; GTB.
        </p>
      </div>
    </div>
  );
}
