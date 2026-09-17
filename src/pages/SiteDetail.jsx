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
import ImportDevisModal from "../components/ImportDevisModal";
import TeamFormModal from "../components/TeamFormModal";
import ReservesPanel from "../components/ReservesPanel";
import TaskFormModal from "../components/TaskFormModal";
import TaskTable from "../components/TaskTable";

const STATUTS_MATERIEL = [
  { value: "a_faire", label: "À installer" },
  { value: "installe", label: "Installé" },
  { value: "configure", label: "Configuré" },
  { value: "teste", label: "Testé" },
];

const STATUTS_TACHE = [
  { value: "a_faire", label: "À faire" },
  { value: "fait", label: "Fait" },
];

export default function SiteDetail() {
  const { chantierId } = useParams();
  const { isAdmin, isChefDeProjet, profile } = useAuth();
  const peutGerer = isAdmin || isChefDeProjet;

  const { documents: chantiers } = useCollection("sites");
  const chantier = chantiers.find((c) => c.id === chantierId);

  // --- Équipements régulés (notre périmètre) ---
  const { documents: tousRegEquipements } = useCollection("regequipements");
  const regEquipements = tousRegEquipements.filter((e) => e.chantierId === chantierId);
  const { documents: tousRegItems } = useCollection("regitems");

  // --- Autres lots techniques (les autres corps d'état) ---
  const { documents: tousLots } = useCollection("lots");
  const lots = tousLots.filter((l) => l.chantierId === chantierId);
  const { documents: tousEquipements } = useCollection("equipments");

  const { documents: tousTemps } = useCollection("timeEntries");
  const tempsChantier = tousTemps.filter((t) => t.chantierId === chantierId);
  const totalHeures = tempsChantier.reduce((s, t) => s + Number(t.duree || 0), 0);

  const { documents: utilisateurs } = useCollection("users", "email");
  const { documents: tousTaches } = useCollection("tasks");

  const [afficherRegForm, setAfficherRegForm] = useState(false);
  const [regSelectionne, setRegSelectionne] = useState(null);
  const [afficherLotForm, setAfficherLotForm] = useState(false);
  const [lotSelectionne, setLotSelectionne] = useState(null);
  const [afficherRapport, setAfficherRapport] = useState(false);
  const [afficherTempsForm, setAfficherTempsForm] = useState(false);
  const [afficherImport, setAfficherImport] = useState(false);
  const [afficherEquipeForm, setAfficherEquipeForm] = useState(false);
  const [afficherTacheForm, setAfficherTacheForm] = useState(false);
  const [tacheEnEdition, setTacheEnEdition] = useState(null);
  const [afficherAffectationMasse, setAfficherAffectationMasse] = useState(false);
  const [ongletActif, setOngletActif] = useState("equipements");

  const supprimerLot = async (lotId) => {
    if (!confirm("Supprimer ce lot et ses équipements ?")) return;
    const equipementsDuLot = tousEquipements.filter((e) => e.lotId === lotId);
    await Promise.all(equipementsDuLot.map((e) => deleteDoc(doc(db, "equipments", e.id))));
    await deleteDoc(doc(db, "lots", lotId));
  };

  const supprimerRegEquipement = async (regId) => {
    if (!confirm("Supprimer cet équipement, son matériel et ses tâches ?")) return;
    const items = tousRegItems.filter((it) => it.regEquipementId === regId);
    await Promise.all(items.map((it) => deleteDoc(doc(db, "regitems", it.id))));
    await deleteDoc(doc(db, "regequipements", regId));
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
          <div className="team-summary">
            <span>
              <strong>RA :</strong> {chantier.ra || "Julien ETCHEVERRY"}
            </span>
            {chantier.responsableChantier && (
              <span>
                <strong>Responsable :</strong> {chantier.responsableChantier}
              </span>
            )}
            {chantier.automaticiens?.length > 0 && (
              <span>
                <strong>Automaticiens :</strong> {chantier.automaticiens.join(", ")}
              </span>
            )}
            {chantier.electriciens?.length > 0 && (
              <span>
                <strong>Électriciens :</strong> {chantier.electriciens.join(", ")}
              </span>
            )}
            <button className="linkish" onClick={() => setAfficherEquipeForm(true)}>
              Modifier l'équipe
            </button>
            {peutGerer && (
              <button className="linkish" onClick={() => setAfficherAffectationMasse(true)}>
                Assigner toutes les tâches à…
              </button>
            )}
          </div>
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

      <div className="page-tabs">
        <button
          className={"page-tab" + (ongletActif === "equipements" ? " page-tab-active" : "")}
          onClick={() => setOngletActif("equipements")}
        >
          Équipements régulés
        </button>
        <button
          className={"page-tab" + (ongletActif === "autres-lots" ? " page-tab-active" : "")}
          onClick={() => setOngletActif("autres-lots")}
        >
          Autres lots
        </button>
        <button
          className={"page-tab" + (ongletActif === "reserves" ? " page-tab-active" : "")}
          onClick={() => setOngletActif("reserves")}
        >
          Réserves
        </button>
        <button
          className={"page-tab" + (ongletActif === "taches" ? " page-tab-active" : "")}
          onClick={() => setOngletActif("taches")}
        >
          Tâches
        </button>
      </div>

      {ongletActif === "equipements" && (
      <section className="panel">
        <div className="panel-header">
          <h2>Équipements régulés</h2>
          {peutGerer && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" onClick={() => setAfficherImport(true)}>
                Importer une minute de devis
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setRegSelectionne(null);
                  setAfficherRegForm(true);
                }}
              >
                + Ajouter un équipement
              </button>
            </div>
          )}
        </div>

        {regEquipements.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Aucun équipement régulé</p>
            <p className="empty-state-description">
              Ajoutez un équipement (ex : LOCAL RCU, CTA RDJ…) manuellement, ou importez
              une minute de devis pour les créer automatiquement avec leur matériel.
            </p>
          </div>
        ) : (
          <div className="lot-list">
            {regEquipements.map((reg) => (
              <RegEquipmentCard
                key={reg.id}
                reg={reg}
                items={tousRegItems.filter((it) => it.regEquipementId === reg.id)}
                peutGerer={peutGerer}
                utilisateurs={utilisateurs}
                onEdit={() => {
                  setRegSelectionne(reg);
                  setAfficherRegForm(true);
                }}
                onDelete={() => supprimerRegEquipement(reg.id)}
              />
            ))}
          </div>
        )}
      </section>
      )}

      {ongletActif === "autres-lots" && (
      <section className="panel">
        <div className="panel-header">
          <h2>Autres lots techniques</h2>
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
        <p className="page-subtitle" style={{ margin: "-6px 0 14px" }}>
          Les corps d'état gérés par d'autres entreprises (CVC, électricité, sécurité
          incendie…) — pour information, pas notre périmètre de régulation.
        </p>

        {lots.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Aucun lot renseigné</p>
            <p className="empty-state-description">
              Ajoutez un lot pour suivre l'avancement des autres corps d'état sur ce
              chantier.
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
      )}

      {ongletActif === "reserves" && (
        <ReservesPanel
          chantierId={chantierId}
          peutGerer={peutGerer}
          utilisateurs={utilisateurs}
        />
      )}

      {ongletActif === "taches" && (
        <section className="panel">
          <div className="panel-header">
            <h2>Tâches</h2>
            <button
              className="btn-ghost"
              onClick={() => {
                setTacheEnEdition(null);
                setAfficherTacheForm(true);
              }}
            >
              + Ajouter une tâche
            </button>
          </div>
          <TaskTable
            taches={tousTaches.filter((t) => t.chantierId === chantierId)}
            peutGerer={peutGerer}
            onEdit={(t) => {
              setTacheEnEdition(t);
              setAfficherTacheForm(true);
            }}
            onDelete={async (id) => {
              if (!confirm("Supprimer cette tâche ?")) return;
              await deleteDoc(doc(db, "tasks", id));
            }}
          />
        </section>
      )}

      {afficherTacheForm && (
        <TaskFormModal
          tache={tacheEnEdition}
          chantiers={chantiers}
          chantierIdFixe={tacheEnEdition ? undefined : chantierId}
          utilisateurs={utilisateurs}
          onClose={() => setAfficherTacheForm(false)}
        />
      )}

      {afficherAffectationMasse && (
        <AssignAllModal
          utilisateurs={utilisateurs}
          onClose={() => setAfficherAffectationMasse(false)}
          onConfirm={async (nom) => {
            const idsRegEquip = regEquipements.map((r) => r.id);
            const tachesDuChantier = tousTaches.filter((t) => t.chantierId === chantierId);
            const regTachesDuChantier = tousRegItems.filter(
              (it) => it.type === "tache" && idsRegEquip.includes(it.regEquipementId)
            );
            await Promise.all([
              ...tachesDuChantier.map((t) =>
                updateDoc(doc(db, "tasks", t.id), { assigneA: nom })
              ),
              ...regTachesDuChantier.map((it) =>
                updateDoc(doc(db, "regitems", it.id), { assigneA: nom })
              ),
            ]);
            setAfficherAffectationMasse(false);
          }}
        />
      )}

      {afficherEquipeForm && (
        <TeamFormModal
          chantier={chantier}
          utilisateurs={utilisateurs}
          onClose={() => setAfficherEquipeForm(false)}
        />
      )}

      {afficherImport && (
        <ImportDevisModal
          chantierId={chantierId}
          onClose={() => setAfficherImport(false)}
        />
      )}

      {afficherRegForm && (
        <RegEquipmentFormModal
          chantierId={chantierId}
          reg={regSelectionne}
          onClose={() => setAfficherRegForm(false)}
        />
      )}

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
          regEquipements={regEquipements}
          regItems={tousRegItems}
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

// ============================================================================
// Équipements régulés (notre périmètre)
// ============================================================================

function RegEquipmentCard({ reg, items, peutGerer, utilisateurs, onEdit, onDelete }) {
  const [ouvert, setOuvert] = useState(false);
  const [afficherItemForm, setAfficherItemForm] = useState(false);
  const [typePourAjout, setTypePourAjout] = useState("materiel");

  const materiel = items.filter((it) => it.type === "materiel");
  const taches = items.filter((it) => it.type === "tache");
  const total = items.length;
  const faits = items.filter((it) => it.statut === "teste" || it.statut === "fait").length;
  const pct = total > 0 ? Math.round((faits / total) * 100) : 0;

  const changerStatut = async (itemId, statut) => {
    await updateDoc(doc(db, "regitems", itemId), { statut });
  };
  const changerResponsable = async (itemId, assigneA) => {
    await updateDoc(doc(db, "regitems", itemId), { assigneA: assigneA || null });
  };
  const supprimerItem = async (itemId) => {
    await deleteDoc(doc(db, "regitems", itemId));
  };

  return (
    <div className="lot-card">
      <div className="lot-card-header" onClick={() => setOuvert(!ouvert)}>
        <div>
          <span className="lot-card-toggle">{ouvert ? "▾" : "▸"}</span>
          <strong>{reg.nom}</strong>
          <span className="simple-list-meta" style={{ marginLeft: 10 }}>
            {materiel.length} matériel · {taches.length} tâche(s)
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
        <div className="lot-card-body reg-item-columns">
          <div className="item-section-materiel">
            <div className="reg-subheading reg-subheading-materiel">
              <span className="reg-subheading-icon">🔧</span>
              Matériel
            </div>
            {materiel.length === 0 ? (
              <p className="empty-state-description" style={{ margin: "4px 0" }}>
                Aucun matériel.
              </p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th>Qté</th>
                    <th>Statut</th>
                    <th>Remarque</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {materiel.map((it) => (
                    <tr key={it.id}>
                      <td style={{ fontFamily: "var(--font-ui)" }}>{it.designation}</td>
                      <td style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}>
                        {it.quantite ? it.quantite + " " + (it.unite || "") : "—"}
                      </td>
                      <td>
                        <select
                          value={it.statut}
                          onChange={(e) => changerStatut(it.id, e.target.value)}
                        >
                          {STATUTS_MATERIEL.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}>
                        {it.remarque || "—"}
                      </td>
                      <td>
                        <button className="btn-ghost btn-danger" onClick={() => supprimerItem(it.id)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {peutGerer && (
              <button
                className="kanban-add-inline"
                onClick={() => {
                  setTypePourAjout("materiel");
                  setAfficherItemForm(true);
                }}
              >
                + Ajouter du matériel
              </button>
            )}
          </div>

          <div className="item-section-tache">
            <div className="reg-subheading reg-subheading-tache">
              <span className="reg-subheading-icon">☑</span>
              Tâches
            </div>
            {taches.length === 0 ? (
              <p className="empty-state-description" style={{ margin: "4px 0" }}>
                Aucune tâche.
              </p>
            ) : (
              <ul className="simple-list">
                {taches.map((it) => (
                  <li key={it.id}>
                    <select
                      value={it.statut}
                      onChange={(e) => changerStatut(it.id, e.target.value)}
                      style={{ flexShrink: 0 }}
                    >
                      {STATUTS_TACHE.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <span className="simple-list-title">{it.designation}</span>
                    <select
                      value={it.assigneA || ""}
                      onChange={(e) => changerResponsable(it.id, e.target.value)}
                      style={{ flexShrink: 0 }}
                    >
                      <option value="">À affecter</option>
                      {utilisateurs.map((u) => (
                        <option key={u.id} value={u.nom}>
                          {u.nom}
                        </option>
                      ))}
                    </select>
                    <button className="btn-ghost btn-danger" onClick={() => supprimerItem(it.id)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {peutGerer && (
              <button
                className="kanban-add-inline"
                onClick={() => {
                  setTypePourAjout("tache");
                  setAfficherItemForm(true);
                }}
              >
                + Ajouter une tâche
              </button>
            )}
          </div>
        </div>
      )}

      {afficherItemForm && (
        <RegItemFormModal
          regEquipementId={reg.id}
          typeInitial={typePourAjout}
          utilisateurs={utilisateurs}
          onClose={() => setAfficherItemForm(false)}
        />
      )}
    </div>
  );
}

function RegEquipmentFormModal({ chantierId, reg, onClose }) {
  const [nom, setNom] = useState(reg?.nom ?? "");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    if (reg) {
      await updateDoc(doc(db, "regequipements", reg.id), { nom });
    } else {
      await addDoc(collection(db, "regequipements"), {
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
        <h2>{reg ? "Modifier l'équipement" : "Nouvel équipement régulé"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Nom de l'équipement
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex : LOCAL RCU, CTA RDJ, Local PAC…"
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

function RegItemFormModal({ regEquipementId, typeInitial, utilisateurs, onClose }) {
  const [type, setType] = useState(typeInitial);
  const [designation, setDesignation] = useState("");
  const [quantite, setQuantite] = useState("");
  const [unite, setUnite] = useState("");
  const [remarque, setRemarque] = useState("");
  const [assigneA, setAssigneA] = useState("");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    await addDoc(collection(db, "regitems"), {
      regEquipementId,
      type,
      designation,
      remarque,
      quantite: quantite ? Number(quantite) : 0,
      unite,
      assigneA: type === "tache" ? assigneA || null : null,
      statut: "a_faire",
      creeLe: serverTimestamp(),
    });
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{type === "materiel" ? "Nouveau matériel" : "Nouvelle tâche"}</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="materiel">Matériel</option>
              <option value="tache">Tâche</option>
            </select>
          </label>
          <label>
            Désignation
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder={
                type === "materiel"
                  ? "ex : Sonde température CTA1"
                  : "ex : Programmation automate"
              }
              required
            />
          </label>
          {type === "tache" && (
            <label>
              Responsable
              <select value={assigneA} onChange={(e) => setAssigneA(e.target.value)}>
                <option value="">À affecter</option>
                {utilisateurs.map((u) => (
                  <option key={u.id} value={u.nom}>
                    {u.nom}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type === "materiel" && (
            <div className="form-inline">
              <label>
                Quantité
                <input
                  type="number"
                  min="0"
                  value={quantite}
                  onChange={(e) => setQuantite(e.target.value)}
                />
              </label>
              <label>
                Unité
                <input
                  value={unite}
                  onChange={(e) => setUnite(e.target.value)}
                  placeholder="u, Ens…"
                />
              </label>
            </div>
          )}
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

// ============================================================================
// Autres lots techniques
// ============================================================================

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
                  <th>Qté</th>
                  <th>Statut</th>
                  <th>Remarque</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {equipements.map((equip) => (
                  <tr key={equip.id}>
                    <td style={{ fontFamily: "var(--font-ui)" }}>{equip.designation}</td>
                    <td style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}>
                      {equip.quantite ? equip.quantite + " " + (equip.unite || "") : "—"}
                    </td>
                    <td>
                      <select
                        value={equip.statut}
                        onChange={(e) => changerStatutEquip(equip.id, e.target.value)}
                      >
                        {STATUTS_MATERIEL.map((s) => (
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
              placeholder="ex : CVC, Électricité, Sécurité incendie…"
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
  const [quantite, setQuantite] = useState("");
  const [unite, setUnite] = useState("");
  const [remarque, setRemarque] = useState("");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    await addDoc(collection(db, "equipments"), {
      designation,
      remarque,
      quantite: quantite ? Number(quantite) : 0,
      unite,
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
        <h2>Nouvel équipement</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Désignation
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              required
            />
          </label>
          <div className="form-inline">
            <label>
              Quantité
              <input
                type="number"
                min="0"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
              />
            </label>
            <label>
              Unité
              <input value={unite} onChange={(e) => setUnite(e.target.value)} placeholder="u, Ens…" />
            </label>
          </div>
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

// ============================================================================
// Compte-rendu
// ============================================================================

function ReportModal({ chantier, regEquipements, regItems, lots, equipements, onClose }) {
  const [copie, setCopie] = useState(false);

  const texte = useMemo(() => {
    const lignes = [];
    lignes.push("Compte-rendu — " + chantier.nom);
    if (chantier.client) lignes.push("Client : " + chantier.client);
    lignes.push("Date : " + new Date().toLocaleDateString("fr-FR"));
    lignes.push("");

    lignes.push("== Équipements régulés ==");
    if (regEquipements.length === 0) {
      lignes.push("Aucun équipement renseigné.");
    }
    for (const reg of regEquipements) {
      const items = regItems.filter((it) => it.regEquipementId === reg.id);
      const faits = items.filter((it) => it.statut === "teste" || it.statut === "fait").length;
      const pct = items.length > 0 ? Math.round((faits / items.length) * 100) : 0;
      lignes.push("• " + reg.nom + " — avancement : " + pct + "%");
      const restants = items.filter((it) => it.statut !== "teste" && it.statut !== "fait");
      if (restants.length > 0) {
        lignes.push("  Restant :");
        for (const it of restants) {
          lignes.push(
            "    - [" + (it.type === "materiel" ? "Matériel" : "Tâche") + "] " + it.designation
          );
        }
      } else if (items.length > 0) {
        lignes.push("  Tout est fait.");
      }
      lignes.push("");
    }

    if (lots.length > 0) {
      lignes.push("== Autres lots techniques ==");
      for (const lot of lots) {
        const eqs = equipements.filter((e) => e.lotId === lot.id);
        const testes = eqs.filter((e) => e.statut === "teste").length;
        const pct = eqs.length > 0 ? Math.round((testes / eqs.length) * 100) : 0;
        lignes.push("• " + lot.nom + " — avancement : " + pct + "%");
      }
    }

    return lignes.join("\n");
  }, [chantier, regEquipements, regItems, lots, equipements]);

  const copier = async () => {
    await navigator.clipboard.writeText(texte);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <h2>Compte-rendu — {chantier.nom}</h2>
        <textarea className="report-textarea" readOnly value={texte} rows={16} />
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

// ============================================================================
// Temps passé
// ============================================================================

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
            Lot concerné (facultatif)
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

function AssignAllModal({ utilisateurs, onClose, onConfirm }) {
  const [nom, setNom] = useState("");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nom) return;
    setEnCours(true);
    await onConfirm(nom);
    setEnCours(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Assigner toutes les tâches</h2>
        <p className="empty-state-description" style={{ margin: "0 0 14px" }}>
          Toutes les tâches de ce chantier (Kanban et tâches d'équipements régulés) seront
          affectées à la personne choisie, y compris celles déjà attribuées à quelqu'un
          d'autre.
        </p>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Assigner à
            <select value={nom} onChange={(e) => setNom(e.target.value)} required>
              <option value="">— Choisir —</option>
              {utilisateurs.map((u) => (
                <option key={u.id} value={u.nom}>
                  {u.nom}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={enCours || !nom}>
              {enCours ? "Affectation…" : "Assigner"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
