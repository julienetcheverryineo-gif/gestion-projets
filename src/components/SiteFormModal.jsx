import { useState } from "react";
import { ZONES_DEFAUT } from "../lib/tauxHoraires";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export const STATUTS_CHANTIER = [
  { value: "actif", label: "Actif" },
  { value: "en_cours", label: "En cours" },
  { value: "en_pause", label: "En pause" },
  { value: "termine", label: "Terminé" },
];

export function formatStatutChantier(statut) {
  return STATUTS_CHANTIER.find((s) => s.value === statut)?.label ?? statut;
}

// Un chantier peut appartenir à l'espace Automatisme & GTB et/ou à l'espace
// Électricité (cases à cocher "Espaces" plus bas) : coché uniquement
// Électricité, il n'apparaît que dans Chantiers Électricité, et
// inversement ; coché les deux, il apparaît dans les deux listes. Exportées
// pour que les pages de liste (Sites.jsx, ElectriciteChantiers.jsx)
// filtrent avec exactement la même règle que le formulaire. Pour les
// chantiers créés avant l'existence de ces deux cases (ancien champ
// `service`, seul et exclusif), on retombe sur son ancienne logique.
export function estChantierAutomatisme(chantier) {
  if (!chantier) return true;
  if (chantier.espaceAutomatisme !== undefined) return chantier.espaceAutomatisme;
  return chantier.service !== "electricite";
}
export function estChantierElectricite(chantier) {
  if (!chantier) return false;
  if (chantier.espaceElectricite !== undefined) return chantier.espaceElectricite;
  return chantier.service === "electricite";
}

// Formulaire chantier unifié : infos générales ET équipe en un seul endroit,
// aussi bien à la création (l'équipe peut rester vide, à affecter plus
// tard) qu'à la modification.
//
// `service` ne sert plus qu'à préremplir les cases Espaces pour un NOUVEAU
// chantier selon l'endroit d'où on l'ouvre (Automatisme ou Électricité) —
// les deux cases restent ensuite librement modifiables, dans les deux
// sens : un chantier peut très bien être rattaché aux deux espaces à la
// fois.
export default function SiteFormModal({ chantier, utilisateurs, service = "automatisme", onClose }) {
  const [nom, setNom] = useState(chantier?.nom ?? "");
  const [client, setClient] = useState(chantier?.client ?? "");
  const [adresse, setAdresse] = useState(chantier?.adresse ?? "");
  const [statut, setStatut] = useState(chantier?.statut ?? "actif");
  const [compte, setCompte] = useState(chantier?.compte ?? "");
  const [zone, setZone] = useState(chantier?.zone ?? "");
  const [espaceAutomatisme, setEspaceAutomatisme] = useState(
    chantier ? estChantierAutomatisme(chantier) : service !== "electricite"
  );
  const [espaceElectricite, setEspaceElectricite] = useState(
    chantier ? estChantierElectricite(chantier) : service === "electricite"
  );
  const [ra, setRa] = useState(chantier?.ra ?? "Julien ETCHEVERRY");
  const [responsableChantier, setResponsableChantier] = useState(
    chantier?.responsableChantier ?? ""
  );
  const [automaticiens, setAutomaticiens] = useState(chantier?.automaticiens ?? []);
  const [electriciensTexte, setElectriciensTexte] = useState(
    (chantier?.electriciens ?? []).join(", ")
  );
  const [electricienAAffecter, setElectricienAAffecter] = useState(
    chantier?.electricienAAffecter ?? false
  );
  const [equipeElectriciens, setEquipeElectriciens] = useState(
    chantier?.equipeElectriciens ?? []
  );
  const [dateDebut, setDateDebut] = useState(chantier?.dateDebut ?? "");
  const [dateFin, setDateFin] = useState(chantier?.dateFin ?? "");
  const [heuresMoPrevisionnelles, setHeuresMoPrevisionnelles] = useState(
    chantier?.heuresMoPrevisionnelles ?? ""
  );
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  const utilisateursElectriciens = utilisateurs.filter((u) => u.role === "electricien");

  const basculerAutomaticien = (nomPersonne) => {
    setAutomaticiens((liste) =>
      liste.includes(nomPersonne) ? liste.filter((n) => n !== nomPersonne) : [...liste, nomPersonne]
    );
  };

  const basculerElectricien = (nomPersonne) => {
    setEquipeElectriciens((liste) =>
      liste.includes(nomPersonne) ? liste.filter((n) => n !== nomPersonne) : [...liste, nomPersonne]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!espaceAutomatisme && !espaceElectricite) {
      setErreur("Le chantier doit appartenir à au moins un espace (Automatisme et/ou Électricité).");
      return;
    }
    setErreur("");
    setEnCours(true);
    const electriciens = electriciensTexte
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const donnees = {
      nom,
      client,
      adresse,
      statut,
      compte,
      zone: zone || null,
      ra,
      responsableChantier,
      espaceAutomatisme,
      espaceElectricite,
      // Conservé pour compatibilité avec l'ancien filtre exclusif (au cas
      // où un autre endroit du code s'y fierait encore) — reflète l'espace
      // Électricité tel qu'il était avant l'ajout des deux cases.
      service: espaceElectricite && !espaceAutomatisme ? "electricite" : null,
      automaticiens,
      electriciens,
      electricienAAffecter,
      equipeElectriciens,
      dateDebut: dateDebut || null,
      dateFin: dateFin || null,
      heuresMoPrevisionnelles: heuresMoPrevisionnelles !== "" ? Number(heuresMoPrevisionnelles) : null,
    };
    if (chantier) {
      await updateDoc(doc(db, "sites", chantier.id), donnees);
    } else {
      await addDoc(collection(db, "sites"), { ...donnees, creeLe: serverTimestamp() });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-chantier" onClick={(e) => e.stopPropagation()}>
        <h2>{chantier ? "Modifier le chantier" : "Nouveau chantier"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Nom du chantier
            <input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </label>
          <label>
            Client
            <input value={client} onChange={(e) => setClient(e.target.value)} />
          </label>
          <label>
            Adresse
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} />
          </label>
          <div className="form-inline">
            <label>
              Statut
              <select value={statut} onChange={(e) => setStatut(e.target.value)}>
                {STATUTS_CHANTIER.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Compte
              <input
                value={compte}
                onChange={(e) => setCompte(e.target.value)}
                placeholder="ex : JE602"
              />
            </label>
            <label>
              Zone de déplacement
              <select value={zone} onChange={(e) => setZone(e.target.value)}>
                <option value="">Non renseignée</option>
                {ZONES_DEFAUT.map((z) => (
                  <option key={z.code} value={z.code}>
                    {z.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-divider">Espaces</div>
          <p className="empty-state-description" style={{ margin: "-6px 0 0" }}>
            Un chantier n'apparaît que dans le(s) espace(s) coché(s) ci-dessous.
          </p>
          <div className="form-inline">
            <label className="team-checklist-item">
              <input
                type="checkbox"
                checked={espaceAutomatisme}
                onChange={(e) => setEspaceAutomatisme(e.target.checked)}
              />
              💻 Automatisme &amp; GTB
            </label>
            <label className="team-checklist-item">
              <input
                type="checkbox"
                checked={espaceElectricite}
                onChange={(e) => setEspaceElectricite(e.target.checked)}
              />
              ⚡ Électricité
            </label>
          </div>

          <div className="form-divider">Équipe (facultatif, à affecter plus tard si besoin)</div>

          <div className="form-inline">
            <label>
              RA (responsable d'affaire)
              <select value={ra} onChange={(e) => setRa(e.target.value)}>
                <option value="">—</option>
                {utilisateurs.map((u) => (
                  <option key={u.id} value={u.nom}>
                    {u.nom}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Responsable de chantier
              <select
                value={responsableChantier}
                onChange={(e) => setResponsableChantier(e.target.value)}
              >
                <option value="">—</option>
                {utilisateurs.map((u) => (
                  <option key={u.id} value={u.nom}>
                    {u.nom}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {espaceElectricite && (
            <div>
              <div className="form-inline">
                <label>
                  Date de début prévue
                  <input
                    type="date"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                  />
                </label>
                <label>
                  Date de fin prévue
                  <input
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                  />
                </label>
                <label>
                  Heures MO prévues (si pas de devis importé)
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={heuresMoPrevisionnelles}
                    onChange={(e) => setHeuresMoPrevisionnelles(e.target.value)}
                    placeholder="ex : 80"
                  />
                </label>
              </div>
              <p className="empty-state-description" style={{ margin: "-6px 0 10px" }}>
                La date de fin prévue sert à répartir automatiquement le reste à faire
                (main d'œuvre) dans le plan de charge Électricité. Si aucun devis n'est
                importé, le nombre d'heures MO prévues ci-dessus est utilisé à la place du
                reste à faire calculé depuis les lignes de devis.
              </p>
              <div className="reg-subheading" style={{ marginBottom: 8 }}>
                Électriciens (utilisateurs de l'application)
              </div>
              {utilisateursElectriciens.length === 0 ? (
                <p className="empty-state-description" style={{ margin: 0 }}>
                  Aucun utilisateur avec le rôle « Électricien » pour l'instant — créez-en un
                  depuis la page Utilisateurs.
                </p>
              ) : (
                <div className="team-checklist">
                  {utilisateursElectriciens.map((u) => (
                    <label key={u.id} className="team-checklist-item">
                      <input
                        type="checkbox"
                        checked={equipeElectriciens.includes(u.nom)}
                        onChange={() => basculerElectricien(u.nom)}
                      />
                      {u.nom}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {espaceAutomatisme && (
            <>
              <div>
                <div className="reg-subheading" style={{ marginBottom: 8 }}>
                  Automaticiens (utilisateurs de l'application)
                </div>
                <div className="team-checklist">
                  {utilisateurs.map((u) => (
                    <label key={u.id} className="team-checklist-item">
                      <input
                        type="checkbox"
                        checked={automaticiens.includes(u.nom)}
                        onChange={() => basculerAutomaticien(u.nom)}
                      />
                      {u.nom}
                    </label>
                  ))}
                </div>
              </div>

              <label>
                Électriciens (souvent externes, sans compte — noms libres séparés par une
                virgule)
                <input
                  value={electriciensTexte}
                  onChange={(e) => setElectriciensTexte(e.target.value)}
                  placeholder="ex : Jean Dupont, Marc Petit"
                />
              </label>
              <label className="team-checklist-item" style={{ marginTop: -6 }}>
                <input
                  type="checkbox"
                  checked={electricienAAffecter}
                  onChange={(e) => setElectricienAAffecter(e.target.checked)}
                />
                Électricien à affecter (besoin identifié, personne pas encore choisie —
                apparaît comme option dans le responsable des tâches)
              </label>
            </>
          )}

          {erreur && <div className="form-error">{erreur}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
