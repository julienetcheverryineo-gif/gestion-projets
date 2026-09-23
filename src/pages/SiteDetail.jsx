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
import SiteFormModal, { formatStatutChantier } from "../components/SiteFormModal";
import ImportDevisModal from "../components/ImportDevisModal";
import ReservesPanel from "../components/ReservesPanel";
import TaskTable from "../components/TaskTable";
import { estTactile } from "../lib/tactile";

const STATUTS_MATERIEL = [
  { value: "a_acheter", label: "À acheter" },
  { value: "recu", label: "Reçu" },
  { value: "installe", label: "Installé" },
  { value: "teste", label: "Testé" },
];

export default function SiteDetail() {
  const { chantierId } = useParams();
  const { isAdmin, isChefDeProjet, profile } = useAuth();
  const peutGerer = isAdmin || isChefDeProjet;

  const { documents: chantiers } = useCollection("sites");
  const chantier = chantiers.find((c) => c.id === chantierId);

  // --- Équipements régulés (notre périmètre) ---
  const { documents: tousRegEquipements } = useCollection("regequipements");
  const regEquipements = tousRegEquipements
    .filter((e) => e.chantierId === chantierId)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
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
  const [afficherAffectationMasse, setAfficherAffectationMasse] = useState(false);
  const [afficherChantierForm, setAfficherChantierForm] = useState(false);
  const [ongletActif, setOngletActif] = useState("taches");
  const [groupementTaches, setGroupementTaches] = useState("flat");
  const [groupeTacheOuvert, setGroupeTacheOuvert] = useState(null);
  const [groupementMateriel, setGroupementMateriel] = useState("flat");

  const tachesDuChantier = useMemo(() => {
    const idsRegEquip = regEquipements.map((r) => r.id);
    const tachesRegitems = tousRegItems
      .filter((it) => it.type === "tache" && idsRegEquip.includes(it.regEquipementId))
      .map((it) => {
        const equip = regEquipements.find((r) => r.id === it.regEquipementId);
        return {
          id: it.id,
          _source: "regitem",
          _equipementNom: equip?.nom ?? "?",
          titre: it.designation,
          chantierId,
          equipementSource: equip?.nom ?? null,
          assigneA: it.assigneA || null,
          heuresPrevues: it.heuresPrevues ?? null,
          dateDebut: null,
          echeance: null,
          commentaires: it.remarque || null,
          statut: it.statut,
        };
      });
    return [...tousTaches.filter((t) => t.chantierId === chantierId), ...tachesRegitems];
  }, [tousTaches, tousRegItems, regEquipements, chantierId]);

  const groupesTachesParEquipement = useMemo(() => {
    const map = new Map();
    for (const t of tachesDuChantier) {
      const cle = t.equipementSource || "sans-equipement";
      if (!map.has(cle)) {
        map.set(cle, { cle, nom: t.equipementSource || "Sans équipement", taches: [] });
      }
      map.get(cle).taches.push(t);
    }
    return [...map.values()].sort((a, b) => b.taches.length - a.taches.length);
  }, [tachesDuChantier]);

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

  // Déplace un équipement de la position `depuis` vers `vers`, puis
  // renumérote toute la liste (0, 1, 2…). Plus fiable qu'un simple échange
  // de deux valeurs, qui ne fonctionne pas quand l'une d'elles (ou les
  // deux) n'a jamais eu de champ `ordre` — cas fréquent pour les
  // équipements créés avant l'ajout de cette fonctionnalité.
  const deplacerEquipement = async (depuis, vers) => {
    if (vers < 0 || vers >= regEquipements.length || depuis === vers) return;
    const copie = [...regEquipements];
    const [item] = copie.splice(depuis, 1);
    copie.splice(vers, 0, item);
    await Promise.all(
      copie.map((r, i) => updateDoc(doc(db, "regequipements", r.id), { ordre: i }))
    );
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
            {formatStatutChantier(chantier.statut)}
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

      <div className="chantier-actions-bar">
        {peutGerer && (
          <button className="btn-accent" onClick={() => setAfficherChantierForm(true)}>
            Modifier le chantier
          </button>
        )}
        {peutGerer && (
          <button className="btn-accent" onClick={() => setAfficherAffectationMasse(true)}>
            Assigner toutes les tâches à…
          </button>
        )}
        {peutGerer && (
          <button className="btn-accent" onClick={() => setAfficherImport(true)}>
            Importer une minute de devis
          </button>
        )}
      </div>

      <div className="page-tabs">
        <button
          className={"page-tab" + (ongletActif === "taches" ? " page-tab-active" : "")}
          onClick={() => setOngletActif("taches")}
        >
          Tâches
        </button>
        <button
          className={"page-tab" + (ongletActif === "equipements" ? " page-tab-active" : "")}
          onClick={() => setOngletActif("equipements")}
        >
          Listing matériel
        </button>
        <button
          className={"page-tab" + (ongletActif === "reserves" ? " page-tab-active" : "")}
          onClick={() => setOngletActif("reserves")}
        >
          Réserves
        </button>
        <button
          className={"page-tab" + (ongletActif === "autres-lots" ? " page-tab-active" : "")}
          onClick={() => setOngletActif("autres-lots")}
        >
          Autres lots
        </button>
      </div>

      {ongletActif === "equipements" && (
      <section className="panel">
        <div className="panel-header">
          <h2>Listing matériel</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {regEquipements.length > 0 && (
              <button
                className="btn-ghost"
                onClick={() =>
                  setGroupementMateriel(groupementMateriel === "equipement" ? "flat" : "equipement")
                }
              >
                {groupementMateriel === "equipement" ? "Vue à plat" : "Grouper par équipement"}
              </button>
            )}
            {peutGerer && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setRegSelectionne(null);
                  setAfficherRegForm(true);
                }}
              >
                + Ajouter un équipement
              </button>
            )}
          </div>
        </div>

        {regEquipements.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Aucun équipement régulé</p>
            <p className="empty-state-description">
              Ajoutez un équipement (ex : LOCAL RCU, CTA RDJ…) manuellement, ou importez
              une minute de devis (bouton en haut de page) pour créer les équipements et
              leur matériel automatiquement.
            </p>
          </div>
        ) : groupementMateriel === "flat" ? (
          <MaterielTablePlat
            regEquipements={regEquipements}
            regItems={tousRegItems}
            peutGerer={peutGerer}
          />
        ) : (
          <div className="lot-list">
            {regEquipements.map((reg, index) => (
              <div
                key={reg.id}
                draggable={peutGerer && !estTactile}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/reg-equip-id", reg.id);
                }}
                onDragOver={(e) => peutGerer && e.preventDefault()}
                onDrop={(e) => {
                  if (!peutGerer) return;
                  e.preventDefault();
                  const idDeplace = e.dataTransfer.getData("text/reg-equip-id");
                  const indexDepart = regEquipements.findIndex((r) => r.id === idDeplace);
                  if (indexDepart === -1 || idDeplace === reg.id) return;
                  deplacerEquipement(indexDepart, index);
                }}
                className={peutGerer && !estTactile ? "reg-equip-draggable" : undefined}
              >
                {peutGerer && estTactile && (
                  <div className="reg-equip-move-mobile">
                    <button
                      className="btn-ghost"
                      disabled={index === 0}
                      onClick={() => deplacerEquipement(index, index - 1)}
                      aria-label="Monter"
                    >
                      ▲ Monter
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={index === regEquipements.length - 1}
                      onClick={() => deplacerEquipement(index, index + 1)}
                      aria-label="Descendre"
                    >
                      ▼ Descendre
                    </button>
                  </div>
                )}
                <RegEquipmentCard
                  reg={reg}
                  items={tousRegItems.filter((it) => it.regEquipementId === reg.id)}
                  peutGerer={peutGerer}
                  onEdit={() => {
                    setRegSelectionne(reg);
                    setAfficherRegForm(true);
                  }}
                  onDelete={() => supprimerRegEquipement(reg.id)}
                />
              </div>
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
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-ghost"
                onClick={() => setGroupementTaches(groupementTaches === "equipement" ? "flat" : "equipement")}
              >
                {groupementTaches === "equipement" ? "Vue à plat" : "Grouper par équipement"}
              </button>
              <button
                className="btn-ghost"
                onClick={() =>
                  addDoc(collection(db, "tasks"), {
                    titre: "Nouvelle tâche",
                    chantierId,
                    equipementSource: null,
                    assigneA: [],
                    heuresPrevues: null,
                    dateDebut: null,
                    echeance: null,
                    lienDevis: null,
                    commentaires: null,
                    statut: "a_faire",
                    ordre: Date.now(),
                    creeLe: serverTimestamp(),
                  })
                }
              >
                + Ajouter une tâche
              </button>
            </div>
          </div>

          {groupementTaches === "flat" ? (
            <TaskTable
              taches={tachesDuChantier}
              peutGerer={peutGerer}
              utilisateurs={utilisateurs}
              onDelete={async (id) => {
                if (!confirm("Supprimer cette tâche ?")) return;
                await deleteDoc(doc(db, "tasks", id));
              }}
            />
          ) : (
            <div className="lot-list">
              {groupesTachesParEquipement.map((g) => (
                <div key={g.cle} className="lot-card">
                  <div
                    className="lot-card-header"
                    onClick={() =>
                      setGroupeTacheOuvert(groupeTacheOuvert === g.cle ? null : g.cle)
                    }
                  >
                    <div>
                      <span className="lot-card-toggle">
                        {groupeTacheOuvert === g.cle ? "▾" : "▸"}
                      </span>
                      <strong>{g.nom}</strong>
                      <span className="simple-list-meta" style={{ marginLeft: 10 }}>
                        {g.taches.length} tâche(s)
                      </span>
                    </div>
                  </div>
                  {groupeTacheOuvert === g.cle && (
                    <div className="lot-card-body">
                      <TaskTable
                        taches={g.taches}
                        peutGerer={peutGerer}
                        utilisateurs={utilisateurs}
                        onDelete={async (id) => {
                          if (!confirm("Supprimer cette tâche ?")) return;
                          await deleteDoc(doc(db, "tasks", id));
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {afficherChantierForm && (
        <SiteFormModal
          chantier={chantier}
          utilisateurs={utilisateurs}
          onClose={() => setAfficherChantierForm(false)}
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
                updateDoc(doc(db, "tasks", t.id), { assigneA: [nom] })
              ),
              ...regTachesDuChantier.map((it) =>
                updateDoc(doc(db, "regitems", it.id), { assigneA: [nom] })
              ),
            ]);
            setAfficherAffectationMasse(false);
          }}
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

function RegEquipmentCard({ reg, items, peutGerer, onEdit, onDelete }) {
  const [ouvert, setOuvert] = useState(false);
  const [afficherItemForm, setAfficherItemForm] = useState(false);

  const materiel = items.filter((it) => it.type === "materiel");
  const total = materiel.length;
  const faits = materiel.filter((it) => it.statut === "teste").length;
  const pct = total > 0 ? Math.round((faits / total) * 100) : 0;

  const changerStatut = async (itemId, statut) => {
    await updateDoc(doc(db, "regitems", itemId), { statut });
  };
  const changerChamp = async (itemId, champ, valeur) => {
    await updateDoc(doc(db, "regitems", itemId), { [champ]: valeur });
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
            {materiel.length} matériel
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
                  <th>Unité</th>
                  <th>Statut</th>
                  <th>Remarque</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {materiel.map((it) => (
                  <tr key={it.id}>
                    <td data-label="Désignation">
                      <input
                        className="import-edit-input"
                        defaultValue={it.designation}
                        onBlur={(e) => {
                          if (e.target.value !== it.designation) {
                            changerChamp(it.id, "designation", e.target.value);
                          }
                        }}
                      />
                    </td>
                    <td data-label="Qté">
                      <input
                        type="number"
                        min="0"
                        className="import-edit-input task-cell-heures"
                        defaultValue={it.quantite ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value ? Number(e.target.value) : 0;
                          if (v !== (it.quantite ?? 0)) changerChamp(it.id, "quantite", v);
                        }}
                      />
                    </td>
                    <td data-label="Unité">
                      <input
                        className="import-edit-input"
                        defaultValue={it.unite ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (it.unite ?? "")) {
                            changerChamp(it.id, "unite", e.target.value);
                          }
                        }}
                      />
                    </td>
                    <td data-label="Statut">
                      <select
                        value={it.statut === "a_faire" ? "a_acheter" : it.statut}
                        onChange={(e) => changerStatut(it.id, e.target.value)}
                      >
                        {STATUTS_MATERIEL.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Remarque">
                      <input
                        className="import-edit-input"
                        defaultValue={it.remarque ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (it.remarque ?? "")) {
                            changerChamp(it.id, "remarque", e.target.value);
                          }
                        }}
                      />
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
            <button className="kanban-add-inline" onClick={() => setAfficherItemForm(true)}>
              + Ajouter du matériel
            </button>
          )}
        </div>
      )}

      {afficherItemForm && (
        <RegItemFormModal
          regEquipementId={reg.id}
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
        ordre: Date.now(),
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

function RegItemFormModal({ regEquipementId, onClose }) {
  const [designation, setDesignation] = useState("");
  const [quantite, setQuantite] = useState("");
  const [unite, setUnite] = useState("");
  const [remarque, setRemarque] = useState("");
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEnCours(true);
    await addDoc(collection(db, "regitems"), {
      regEquipementId,
      type: "materiel",
      designation,
      remarque,
      quantite: quantite ? Number(quantite) : 0,
      unite,
      assigneA: [],
      heuresPrevues: null,
      statut: "a_acheter",
      creeLe: serverTimestamp(),
    });
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nouveau matériel</h2>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Désignation
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="ex : Sonde température CTA1"
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
              <input
                value={unite}
                onChange={(e) => setUnite(e.target.value)}
                placeholder="u, Ens…"
              />
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
                    <td data-label="Désignation" style={{ fontFamily: "var(--font-ui)" }}>
                      {equip.designation}
                    </td>
                    <td
                      data-label="Qté"
                      style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}
                    >
                      {equip.quantite ? equip.quantite + " " + (equip.unite || "") : "—"}
                    </td>
                    <td data-label="Statut">
                      <select
                        value={equip.statut === "a_faire" ? "a_acheter" : equip.statut}
                        onChange={(e) => changerStatutEquip(equip.id, e.target.value)}
                      >
                        {STATUTS_MATERIEL.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      data-label="Remarque"
                      style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}
                    >
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
      statut: "a_acheter",
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

    lignes.push("== Listing matériel ==");
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

// Vue "à plat" du matériel de tous les équipements régulés d'un chantier,
// façon tableau des tâches (une colonne Équipement au lieu de groupes
// dépliables), pour scanner/éditer rapidement une longue liste d'achats.
function valeurColonneMateriel(it, colonne, nomEquipement) {
  switch (colonne) {
    case "equipement":
      return nomEquipement(it.regEquipementId);
    case "designation":
      return it.designation || "";
    case "quantite":
      return it.quantite ?? "";
    case "unite":
      return it.unite || "";
    case "statut":
      return it.statut === "a_faire" ? "a_acheter" : it.statut || "";
    case "remarque":
      return it.remarque || "";
    default:
      return "";
  }
}

function MaterielTablePlat({ regEquipements, regItems, peutGerer }) {
  const [tri, setTri] = useState({ colonne: null, sens: 1 });
  const [filtres, setFiltres] = useState({});

  const nomEquipement = (id) => regEquipements.find((r) => r.id === id)?.nom ?? "?";
  const idsRegEquip = regEquipements.map((r) => r.id);
  const materielBrut = regItems.filter(
    (it) => it.type === "materiel" && idsRegEquip.includes(it.regEquipementId)
  );

  const changerStatut = async (itemId, statut) => {
    await updateDoc(doc(db, "regitems", itemId), { statut });
  };
  const changerChamp = async (itemId, champ, valeur) => {
    await updateDoc(doc(db, "regitems", itemId), { [champ]: valeur });
  };
  const supprimerItem = async (itemId) => {
    await deleteDoc(doc(db, "regitems", itemId));
  };

  const basculerTri = (colonne) => {
    setTri((t) => {
      if (t.colonne !== colonne) return { colonne, sens: 1 };
      if (t.sens === 1) return { colonne, sens: -1 };
      return { colonne: null, sens: 1 };
    });
  };
  const changerFiltre = (colonne, valeur) => setFiltres((f) => ({ ...f, [colonne]: valeur }));

  const materiel = useMemo(() => {
    const entreesFiltre = Object.entries(filtres).filter(([, v]) => v && v.trim());
    let liste = materielBrut;
    if (entreesFiltre.length > 0) {
      liste = liste.filter((it) =>
        entreesFiltre.every(([colonne, valeur]) =>
          String(valeurColonneMateriel(it, colonne, nomEquipement))
            .toLowerCase()
            .includes(valeur.trim().toLowerCase())
        )
      );
    }
    if (tri.colonne) {
      liste = [...liste].sort((a, b) => {
        const va = valeurColonneMateriel(a, tri.colonne, nomEquipement);
        const vb = valeurColonneMateriel(b, tri.colonne, nomEquipement);
        if (va < vb) return -1 * tri.sens;
        if (va > vb) return 1 * tri.sens;
        return 0;
      });
    }
    return liste;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materielBrut, filtres, tri]);

  if (materielBrut.length === 0) {
    return (
      <p className="empty-state-description" style={{ margin: "8px 0" }}>
        Aucun matériel.
      </p>
    );
  }

  const Entete = ({ colonne, largeur, children }) => (
    <th style={largeur ? { width: largeur } : undefined}>
      <button type="button" className="th-tri-btn" onClick={() => basculerTri(colonne)}>
        {children}
        {tri.colonne === colonne ? (tri.sens > 0 ? " ▾" : " ▴") : ""}
      </button>
    </th>
  );
  const FiltreCell = ({ colonne }) => (
    <th>
      <input
        className="th-filtre-input"
        placeholder="Filtrer…"
        value={filtres[colonne] ?? ""}
        onChange={(e) => changerFiltre(colonne, e.target.value)}
      />
    </th>
  );

  return (
    <table className="data-table" style={{ tableLayout: "fixed" }}>
      <thead>
        <tr>
          <Entete colonne="equipement" largeur={160}>Équipement</Entete>
          <Entete colonne="designation">Désignation</Entete>
          <Entete colonne="quantite" largeur={70}>Qté</Entete>
          <Entete colonne="unite" largeur={70}>Unité</Entete>
          <Entete colonne="statut" largeur={120}>Statut</Entete>
          <Entete colonne="remarque">Remarque</Entete>
          <th style={{ width: 32 }}></th>
        </tr>
        <tr>
          <FiltreCell colonne="equipement" />
          <FiltreCell colonne="designation" />
          <FiltreCell colonne="quantite" />
          <FiltreCell colonne="unite" />
          <FiltreCell colonne="statut" />
          <FiltreCell colonne="remarque" />
          <th></th>
        </tr>
      </thead>
      <tbody>
        {materiel.length === 0 ? (
          <tr>
            <td colSpan={7} style={{ textAlign: "center", padding: "16px 0" }}>
              <span className="simple-list-meta">Aucun matériel ne correspond aux filtres.</span>
            </td>
          </tr>
        ) : (
          materiel.map((it) => (
            <tr key={it.id}>
              <td data-label="Équipement">
                <select
                  className="import-edit-input"
                  value={it.regEquipementId}
                  onChange={(e) => changerChamp(it.id, "regEquipementId", e.target.value)}
                >
                  {regEquipements.map((reg) => (
                    <option key={reg.id} value={reg.id}>
                      {reg.nom}
                    </option>
                  ))}
                </select>
              </td>
              <td data-label="Désignation">
                <input
                  className="import-edit-input"
                  defaultValue={it.designation}
                  onBlur={(e) => {
                    if (e.target.value !== it.designation) {
                      changerChamp(it.id, "designation", e.target.value);
                    }
                  }}
                />
              </td>
              <td data-label="Qté">
                <input
                  type="number"
                  min="0"
                  className="import-edit-input task-cell-heures"
                  defaultValue={it.quantite ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value ? Number(e.target.value) : 0;
                    if (v !== (it.quantite ?? 0)) changerChamp(it.id, "quantite", v);
                  }}
                />
              </td>
              <td data-label="Unité">
                <input
                  className="import-edit-input"
                  defaultValue={it.unite ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (it.unite ?? "")) {
                      changerChamp(it.id, "unite", e.target.value);
                    }
                  }}
                />
              </td>
              <td data-label="Statut">
                <select
                  value={it.statut === "a_faire" ? "a_acheter" : it.statut}
                  onChange={(e) => changerStatut(it.id, e.target.value)}
                >
                  {STATUTS_MATERIEL.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </td>
              <td data-label="Remarque">
                <input
                  className="import-edit-input"
                  defaultValue={it.remarque ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (it.remarque ?? "")) {
                      changerChamp(it.id, "remarque", e.target.value);
                    }
                  }}
                />
              </td>
              <td>
                {peutGerer && (
                  <button className="btn-ghost btn-danger" onClick={() => supprimerItem(it.id)}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
