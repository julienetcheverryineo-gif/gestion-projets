import NotesPanel from "../components/NotesPanel";

// Note partagée de l'espace Électricité : problèmes rencontrés, visibles
// et complétables par tous les utilisateurs de l'espace.
export default function ElectriciteNotes() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Problèmes rencontrés</h1>
          <p className="page-subtitle">Note partagée de l'espace Électricité</p>
        </div>
      </header>
      <section className="panel">
        <NotesPanel portee="elec-problemes" texteVide="Aucun problème noté pour l'instant." />
      </section>
    </div>
  );
}
