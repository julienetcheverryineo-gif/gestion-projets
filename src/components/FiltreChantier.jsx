export default function FiltreChantier({ chantiers, valeur, onChange }) {
  return (
    <div className="chantiers-filtres" style={{ marginBottom: 20 }}>
      <select value={valeur} onChange={(e) => onChange(e.target.value)}>
        <option value="tous">Tous les chantiers</option>
        {chantiers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.client ? c.client + " - " + c.nom : c.nom}
          </option>
        ))}
      </select>
    </div>
  );
}
