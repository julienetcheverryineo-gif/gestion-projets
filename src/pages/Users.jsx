import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../lib/firestoreHooks";

const ROLES = [
  { value: "technicien", label: "Technicien" },
  { value: "chef_de_projet", label: "Chef de projet" },
  { value: "admin", label: "Administrateur" },
];

export default function Users() {
  const { documents: utilisateurs, chargement } = useCollection("users", "email");

  const changerRole = async (userId, role) => {
    await updateDoc(doc(db, "users", userId), { role });
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Utilisateurs</h1>
        <p className="page-subtitle">Gérez les rôles de l'équipe.</p>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
