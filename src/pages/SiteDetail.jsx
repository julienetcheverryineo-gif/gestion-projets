import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCollection } from "../lib/firestoreHooks";
import { formatStatut } from "./Sites";

const STATUTS_EQUIPEMENT = [
  { value: "a_faire", label: "À installer" },
  { value: "installe", label: "Installé" },
  { value: "configure", label: "Configuré" },
  { value: "teste", label: "Testé" },
];

export default function SiteDetail() {
  const { chantierId } = useParams();
  const { isAdmin, isChefDeProjet, profile } = useAuth();
  const peutGerer = isAdmin || isChefDeProjet;

  const { documents: chantiers } = useCollection("sites");
  const chantier = chantiers.find((c) => c.id === chantierId);

  const { documents: tousLots } = useCollection("lots");
  const lots = tousLots.filter((l) => l.chantierId === chantierId);

  const { documents: tousEquipements } = useCollection("equipments");
  const { documents: tousTemps } = useCollection("timeEntries");
  const tempsChantier = tousTemps.filter((t) => t.chantierId === chantierId);
  const totalHeures = tempsChantier.reduce((s, t) => s + Number(t.duree || 0), 0);

  const [afficherLotForm, setAfficherLotForm] = useState(false);
  const [lotSelectionne, setLotSelectionne] = useState(null);
  const [afficherRapport, setAfficherRapport] = useState(false);
  const [afficherTempsForm, setAfficherTempsForm] = useState(false);

  const supprimerLot = async (lotId) => {
    if (!confirm("Supprimer ce lot et ses équipements ?")) return;
    const equipementsDuLot = tousEquipements.filter((e) => e.lotId === lotId);
    await Promise.all(equipementsDuLot.map((e) => deleteDoc(doc(db, "equipments", e.id))));
    await deleteDoc(doc(db, "lots", lotId));
  };

  if (!chantier) {
    return <div className="page-loading">Chargement du chantier…</div>;
  }

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <Link to="/chantiers" className="link">
            ← Tous les chantiers
          </Link>
          <h1 style={{ marginTop: 8 }}>{chantier.nom}</h1>
          <p className="page-subtitle">
            {chantier.client && "Client : " + chantier.client + " · "}
            {formatStatut(chantier.statut)}
            {totalHeures > 0 && " · " + totalHeures + " h passées"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={() => setAfficherTempsForm(true)}>
            + Temps passé
          </button>
          <button className="btn-primary" onClick={() => setAfficherRapport(true)}>
            Générer un compte-rendu
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <h2>Lots techniques</h2>
          {peutGerer && (
            <button
              className="btn-ghost"
              onClick={() => {
                setLotSelectionne(null);
                setAfficherLotForm(true);
              }}
            >
              + Ajouter un lot
            </button>
          )}
        </div>

        {lots.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Aucun lot technique</p>
            <p className="empty-state-description">
              Ajoutez un lot (CVC, Éclairage, Sécurité incendie, GTB…) pour commencer à
              suivre les équipements.
            </p>
          </div>
        ) : (
          <div className="lot-list">
            {lots.map((lot) => (
              <LotCard
                key={lot.id}
                lot={lot}
                equipements={tousEquipements.filter((e) => e.lotId === lot.id)}
                peutGerer={peutGerer}
                onEdit={() => {
                  setLotSelectionne(lot);
                  setAfficherLotForm(true);
                }}
                onDelete={() => supprimerLot(lot.id)}
              />
            ))}
          </div>
        )}
      </section>

      {afficherLotForm && (
        <LotFormModal
          chantierId={chantierId}
          lot={lotSelectionne}
          onClose={() => setAfficherLotForm(false)}
        />
      )}

      {afficherRapport && (
        <ReportModal
          chantier={chantier}
          lots={lots}
          equipements={tousEquipements}
          onClose={() => setAfficherRapport(false)}
        />
      )}

      {afficherTempsForm && (
        <TimeFormModal
          chantierId={chantierId}
          lots={lots}
          profil={profile}
          onClose={() => setAfficherTempsForm(false)}
        />
      )}
    </div>
  );
}

function LotCard({ lot, equipements, peutGerer, onEdit, onDelete }) {
  const [ouvert, setOuvert] = useState(false);
  const [afficherEquipForm, setAfficherEquipForm] = useState(false);

  const total = equipements.length;
  const testes = equipements.filter((e) => e.statut === "teste").length;
  const pct = total > 0 ? Math.round((testes / total) * 100) : lot.avancement ?? 0;

  const changerStatutEquip = async (equipId, statut) => {
    await updateDoc(doc(db, "equipments", equipId), { statut });
  };

  const supprimerEquip = async (equipId) => {
    await deleteDoc(doc(db, "equipments", equipId));
  };

  return (
    <div className="lot-card">
      <div className="lot-card-header" onClick={() => setOuvert(!ouvert)}>
        <div>
          <span className="lot-card-toggle">{ouvert ? "▾" : "▸"}</span>
          <strong>{lot.nom}</strong>
          <span className="simple-list-meta" style={{ marginLeft: 10 }}>
            {total > 0 ? testes + "/" + total + " équipements testés" : "Aucun équipement"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="kanban-count">{pct}%</span>
          {peutGerer && (
            <>
              <button
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                Modifier
              </button>
              <button
                className="btn-ghost btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                Supprimer
              </button>
            </>
          )}
        </div>
      </div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: pct + "%" }} />
      </div>

      {ouvert && (
        <div className="lot-card-body">
          {equipements.length === 0 ? (
            <p className="empty-state-description" style={{ margin: "8px 0" }}>
              Aucun équipement ajouté pour ce lot.
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th>Statut</th>
                  <th>Remarque</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {equipements.map((equip) => (
                  <tr key={equip.id}>
                    <td style={{ fontFamily: "var(--font-ui)" }}>{equip.designation}</td>
                    <td>
                      <select
                        value={equip.statut}
                        onChange={(e) => changerStatutEquip(equip.id, e.target.value)}
                      >
                        {STATUTS_EQUIPEMENT.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}>
                      {equip.remarque || "—"}
                    </td>
                    <td>
                      <button className="btn-ghost btn-danger" onClick={() => supprimerEquip(equip.id)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button className="kanban-add-inline" onClick={() => setAfficherEquipForm(true)}>
            + Ajouter un équipement
          </button>
        </div>
      )}

      {afficherEquipForm && (
        <EquipmentFormModal lotId={lot.id} onClose={() => setAfficherEquipForm(false)} />
      )}
    </div>
  );
}

function LotFormModal({ chantierId, lot, onClose }) {
  const [nom, setNom] = useState(lot?.nom ?? "");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    if (lot) {
      await updateDoc(doc(db, "lots", lot.id), { nom });
    } else {
      await addDoc(collection(db, "lots"), {
        nom,
        chantierId,
        creeLe: serverTimestamp(),
      });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{lot ? "Modifier le lot" : "Nouveau lot technique"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Nom du lot
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex : CVC, Éclairage, Sécurité incendie, GTB…"
              required
            />
          </label>
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

function EquipmentFormModal({ lotId, onClose }) {
  const [designation, setDesignation] = useState("");
  const [remarque, setRemarque] = useState("");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    await addDoc(collection(db, "equipments"), {
      designation,
      remarque,
      lotId,
      statut: "a_faire",
      creeLe: serverTimestamp(),
    });
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nouvel équipement / point</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Désignation
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="ex : Sonde température CTA1, Détecteur DI-04…"
              required
            />
          </label>
          <label>
            Remarque
            <input value={remarque} onChange={(e) => setRemarque(e.target.value)} />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Ajout…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReportModal({ chantier, lots, equipements, onClose }) {
  const [copie, setCopie] = useState(false);

  const texte = useMemo(() => {
    const lignes = [];
    lignes.push("Compte-rendu — " + chantier.nom);
    if (chantier.client) lignes.push("Client : " + chantier.client);
    lignes.push("Date : " + new Date().toLocaleDateString("fr-FR"));
    lignes.push("");
    if (lots.length === 0) {
      lignes.push("Aucun lot technique renseigné pour ce chantier.");
    }
    for (const lot of lots) {
      const eqs = equipements.filter((e) => e.lotId === lot.id);
      const testes = eqs.filter((e) => e.statut === "teste").length;
      const pct = eqs.length > 0 ? Math.round((testes / eqs.length) * 100) : 0;
      lignes.push("• " + lot.nom + " — avancement : " + pct + "%");
      const restants = eqs.filter((e) => e.statut !== "teste");
      if (restants.length > 0) {
        lignes.push("  Points restants :");
        for (const eq of restants) {
          lignes.push(
            "    - " + eq.designation + " (" + labelStatutEquip(eq.statut) + ")" +
              (eq.remarque ? " — " + eq.remarque : "")
          );
        }
      } else if (eqs.length > 0) {
        lignes.push("  Tous les équipements de ce lot sont testés.");
      }
      lignes.push("");
    }
    return lignes.join("\n");
  }, [chantier, lots, equipements]);

  const copier = async () => {
    await navigator.clipboard.writeText(texte);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <h2>Compte-rendu — {chantier.nom}</h2>
        <textarea className="report-textarea" readOnly value={texte} rows={14} />
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Fermer
          </button>
          <button className="btn-primary" onClick={copier}>
            {copie ? "Copié !" : "Copier le texte"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeFormModal({ chantierId, lots, profil, onClose }) {
  const [lotId, setLotId] = useState("");
  const [duree, setDuree] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!duree) return;
    setEnCours(true);
    await addDoc(collection(db, "timeEntries"), {
      userId: profil.id,
      userNom: profil.nom,
      chantierId,
      lotId: lotId || null,
      duree: Number(duree),
      date,
      creeLe: serverTimestamp(),
    });
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ajouter du temps passé</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Lot concerné
            <select value={lotId} onChange={(e) => setLotId(e.target.value)}>
              <option value="">Général</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Durée (heures)
            <input
              type="number"
              step="0.25"
              min="0"
              value={duree}
              onChange={(e) => setDuree(e.target.value)}
              placeholder="ex : 2.5"
              required
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours}>
              {enCours ? "Ajout…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function labelStatutEquip(statut) {
  return STATUTS_EQUIPEMENT.find((s) => s.value === statut)?.label ?? statut;
}
