import { useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { useCollection } from "../lib/firestoreHooks";
import { correspondARecherche } from "../lib/recherche";
import { exporterTestsExcel, genererCompteRenduTests, STATUTS_POINT } from "../lib/testsExcel";
import ImportTestsExcelModal from "./ImportTestsExcelModal";

const TYPES_POINT = ["DI", "DO", "AI", "AO", "autre"];

function TestEquipementFormModal({ equipement, onClose, chantierId }) {
  const [nom, setNom] = useState(equipement?.nom ?? "");
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnCours(true);
    if (equipement) {
      await updateDoc(doc(db, "testEquipements", equipement.id), { nom });
    } else {
      await addDoc(collection(db, "testEquipements"), {
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
        <h2>{equipement ? "Modifier l'équipement" : "Nouvel équipement à tester"}</h2>
        <form onSubmit={enregistrer} className="form">
          <label>
            Nom (ex : CTA RDJ, Armoire TGBT…)
            <input value={nom} onChange={(e) => setNom(e.target.value)} required />
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

function PointFormModal({ testEquipementId, chantierId, point, nbExistants, onClose }) {
  const [repere, setRepere] = useState(point?.repere ?? "");
  const [designation, setDesignation] = useState(point?.designation ?? "");
  const [type, setType] = useState(point?.type ?? "DI");
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnCours(true);
    if (point) {
      await updateDoc(doc(db, "testPoints", point.id), { repere, designation, type });
    } else {
      await addDoc(collection(db, "testPoints"), {
        testEquipementId,
        chantierId,
        repere,
        designation,
        type,
        statut: "non_teste",
        valeurMesuree: "",
        commentaire: "",
        testePar: null,
        testeLe: null,
        ordre: nbExistants,
        creeLe: serverTimestamp(),
      });
    }
    setEnCours(false);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{point ? "Modifier le point" : "Ajouter un point"}</h2>
        <form onSubmit={enregistrer} className="form">
          <label>
            Repère (ex : DI12, AO3…)
            <input value={repere} onChange={(e) => setRepere(e.target.value)} required />
          </label>
          <label>
            Désignation
            <input value={designation} onChange={(e) => setDesignation(e.target.value)} required />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES_POINT.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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

// Import rapide de plusieurs points d'un coup en collant un tableau
// (repère, désignation, type — une liste de points qu'on a généralement
// déjà ailleurs : plan de câblage, table Modbus...), même principe que
// l'import de registres Modbus sur la page Aide.
function ImportPointsModal({ testEquipementId, chantierId, nbExistants, onClose }) {
  const [texte, setTexte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const lignes = texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\t|;/).map((c) => c.trim()))
    .filter((champs) => champs.length >= 1 && champs[0])
    .map((champs) => ({
      repere: champs[0] || "",
      designation: champs[1] || "",
      type: (champs[2] || "autre").toUpperCase(),
    }));

  const importer = async () => {
    if (lignes.length === 0) return;
    setEnCours(true);
    setErreur("");
    try {
      const TAILLE_LOT = 450;
      for (let depart = 0; depart < lignes.length; depart += TAILLE_LOT) {
        const lot = lignes.slice(depart, depart + TAILLE_LOT);
        const batch = writeBatch(db);
        lot.forEach((l, i) => {
          const ref = doc(collection(db, "testPoints"));
          batch.set(ref, {
            ...l,
            testEquipementId,
            chantierId,
            statut: "non_teste",
            valeurMesuree: "",
            commentaire: "",
            testePar: null,
            testeLe: null,
            ordre: nbExistants + depart + i,
            creeLe: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      onClose();
    } catch (err) {
      setErreur("Erreur pendant l'import : " + err.message);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="import-popup" onClick={(e) => e.stopPropagation()}>
        <h2>Coller un tableau de points</h2>
        <p className="empty-state-description" style={{ margin: "0 0 10px" }}>
          Une ligne par point : repère, désignation, type (DI/DO/AI/AO), séparés par une
          tabulation (copié depuis Excel) ou un point-virgule.
        </p>
        <textarea
          rows={10}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={"DI1\tDéfaut ventilateur\tDI\nAO3\tConsigne température\tAO"}
          style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}
        />
        <p className="page-subtitle" style={{ margin: "8px 0" }}>
          {lignes.length} point(s) détecté(s)
        </p>
        {erreur && <div className="form-error">{erreur}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={enCours || lignes.length === 0}
            onClick={importer}
          >
            {enCours ? "Import…" : "Importer " + lignes.length + " point(s)"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BoutonsStatut({ point, onChanger }) {
  return (
    <div className="test-statut-btns">
      {STATUTS_POINT.map((s) => (
        <button
          key={s.value}
          type="button"
          className={
            "test-statut-btn test-statut-" + s.value + (point.statut === s.value ? " actif" : "")
          }
          onClick={() => onChanger(s.value)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function formatDateHeure(valeur) {
  if (!valeur?.toDate) return "";
  const d = valeur.toDate();
  return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function TestsPanel({ chantierId, peutGerer, nomTesteur, chantier }) {
  const { documents: toutesEquipements } = useCollection("testEquipements");
  const equipements = toutesEquipements
    .filter((e) => e.chantierId === chantierId)
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  const { documents: tousPoints } = useCollection("testPoints");

  const [equipementSelectionneId, setEquipementSelectionneId] = useState(null);
  const [afficherFormEquipement, setAfficherFormEquipement] = useState(false);
  const [equipementEnEdition, setEquipementEnEdition] = useState(null);
  const [afficherFormPoint, setAfficherFormPoint] = useState(false);
  const [pointEnEdition, setPointEnEdition] = useState(null);
  const [afficherImport, setAfficherImport] = useState(false);
  const [afficherImportExcel, setAfficherImportExcel] = useState(false);
  const [suppressionEnCours, setSuppressionEnCours] = useState(null);
  const [recherche, setRecherche] = useState("");

  const equipementSelectionne =
    equipements.find((e) => e.id === equipementSelectionneId) ?? equipements[0] ?? null;

  const pointsEquipement = equipementSelectionne
    ? tousPoints
        .filter((p) => p.testEquipementId === equipementSelectionne.id)
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    : [];
  const pointsFiltres = pointsEquipement.filter((p) =>
    correspondARecherche(recherche, [p.repere, p.designation, p.type, p.commentaire])
  );

  const pointsChantier = tousPoints.filter((p) => p.chantierId === chantierId);
  const nbOk = pointsChantier.filter((p) => p.statut === "ok").length;
  const nbKo = pointsChantier.filter((p) => p.statut === "ko").length;
  const nbAnnules = pointsChantier.filter((p) => p.statut === "annule").length;
  const nbTestes = nbOk + nbKo + nbAnnules;

  const supprimerEquipement = async (equipement) => {
    if (
      !confirm(
        "Supprimer l'équipement « " + equipement.nom + " » ? Tous ses points seront aussi supprimés."
      )
    )
      return;
    setSuppressionEnCours(equipement.id);
    const snap = await getDocs(
      query(collection(db, "testPoints"), where("testEquipementId", "==", equipement.id))
    );
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, "testEquipements", equipement.id));
    await batch.commit();
    setSuppressionEnCours(null);
    if (equipementSelectionneId === equipement.id) setEquipementSelectionneId(null);
  };

  const supprimerPoint = async (point) => {
    if (!confirm("Supprimer ce point ?")) return;
    await deleteDoc(doc(db, "testPoints", point.id));
  };

  const changerStatut = async (point, statut) => {
    const decisionPrise = statut === "ok" || statut === "ko" || statut === "annule";
    await updateDoc(doc(db, "testPoints", point.id), {
      statut,
      testePar: decisionPrise ? nomTesteur : null,
      testeLe: decisionPrise ? serverTimestamp() : null,
    });
  };

  const changerChamp = async (point, champ, valeur) => {
    if ((point[champ] || "") === valeur) return;
    await updateDoc(doc(db, "testPoints", point.id), { [champ]: valeur });
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Tests point à point</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {pointsChantier.length > 0 && (
            <button
              className="btn-ghost"
              onClick={() => genererCompteRenduTests(pointsChantier, equipements, chantier, nomTesteur)}
            >
              📄 Générer le compte-rendu
            </button>
          )}
          {pointsChantier.length > 0 && (
            <button
              className="btn-ghost"
              onClick={() => exporterTestsExcel(pointsChantier, equipements)}
            >
              Exporter en Excel
            </button>
          )}
          {pointsChantier.length > 0 && (
            <button className="btn-ghost" onClick={() => setAfficherImportExcel(true)}>
              Importer les résultats
            </button>
          )}
        </div>
      </div>
      {pointsChantier.length > 0 && (
        <p className="page-subtitle" style={{ margin: "-6px 0 14px" }}>
          {nbTestes} / {pointsChantier.length} point(s) traité(s) sur ce chantier — {nbOk} OK
          {nbKo > 0 && <strong style={{ color: "var(--danger)" }}>, {nbKo} en défaut (KO)</strong>}
          {nbAnnules > 0 && ", " + nbAnnules + " annulé(s)"}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
        <div className="panel" style={{ padding: 16, alignSelf: "start" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
            <h3 style={{ margin: 0 }}>Équipements</h3>
            {peutGerer && (
              <button
                className="btn-ghost"
                style={{ whiteSpace: "nowrap" }}
                onClick={() => {
                  setEquipementEnEdition(null);
                  setAfficherFormEquipement(true);
                }}
              >
                + Nouveau
              </button>
            )}
          </div>
          {equipements.length === 0 ? (
            <p className="empty-state-description" style={{ margin: 0 }}>
              Aucun équipement pour l'instant. Créez-en un, puis collez-y la liste de ses
              points (DI/DO/AI/AO).
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {equipements.map((e) => {
                const pts = tousPoints.filter((p) => p.testEquipementId === e.id);
                const testes = pts.filter((p) => p.statut !== "non_teste").length;
                return (
                  <button
                    key={e.id}
                    className={
                      "btn-ghost" + (equipementSelectionne?.id === e.id ? " btn-espace-actif" : "")
                    }
                    style={{ justifyContent: "flex-start", textAlign: "left" }}
                    onClick={() => setEquipementSelectionneId(e.id)}
                  >
                    {e.nom}
                    {pts.length > 0 && (
                      <span className="simple-list-meta" style={{ marginLeft: 6 }}>
                        ({testes}/{pts.length})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          {!equipementSelectionne ? (
            <div className="empty-state">
              <p className="empty-state-title">Aucun équipement sélectionné</p>
              <p className="empty-state-description">
                Choisissez un équipement dans la liste, ou créez-en un nouveau.
              </p>
            </div>
          ) : (
            <div className="panel" style={{ padding: 20 }}>
              <div className="panel-header" style={{ alignItems: "flex-start" }}>
                <h3 style={{ margin: 0 }}>{equipementSelectionne.nom}</h3>
                {peutGerer && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        setEquipementEnEdition(equipementSelectionne);
                        setAfficherFormEquipement(true);
                      }}
                    >
                      Modifier
                    </button>
                    <button
                      className="btn-ghost btn-danger"
                      onClick={() => supprimerEquipement(equipementSelectionne)}
                      disabled={suppressionEnCours === equipementSelectionne.id}
                    >
                      {suppressionEnCours === equipementSelectionne.id
                        ? "Suppression…"
                        : "Supprimer l'équipement"}
                    </button>
                  </div>
                )}
              </div>

              {peutGerer && (
                <div style={{ display: "flex", gap: 8, margin: "12px 0 16px" }}>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setPointEnEdition(null);
                      setAfficherFormPoint(true);
                    }}
                  >
                    + Ajouter un point
                  </button>
                  <button className="btn-ghost" onClick={() => setAfficherImport(true)}>
                    📋 Coller un tableau
                  </button>
                </div>
              )}

              {pointsEquipement.length === 0 ? (
                <p className="empty-state-description">
                  Aucun point pour cet équipement pour l'instant.
                </p>
              ) : (
                <>
                  <input
                    placeholder="Rechercher un point…"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    style={{ width: "100%", marginBottom: 10 }}
                  />
                  <div className="data-table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Repère</th>
                          <th>Désignation</th>
                          <th>Type</th>
                          <th>Statut</th>
                          <th>Valeur mesurée</th>
                          <th>Commentaire</th>
                          <th>Testé</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pointsFiltres.map((p) => (
                          <tr key={p.id}>
                            <td data-label="Repère" style={{ fontFamily: "var(--font-mono)" }}>
                              {p.repere}
                            </td>
                            <td data-label="Désignation">{p.designation}</td>
                            <td data-label="Type">{p.type}</td>
                            <td data-label="Statut">
                              <BoutonsStatut point={p} onChanger={(s) => changerStatut(p, s)} />
                            </td>
                            <td data-label="Valeur mesurée">
                              <input
                                className="test-inline-input"
                                defaultValue={p.valeurMesuree || ""}
                                onBlur={(e) => changerChamp(p, "valeurMesuree", e.target.value)}
                              />
                            </td>
                            <td data-label="Commentaire">
                              <input
                                className="test-inline-input"
                                defaultValue={p.commentaire || ""}
                                onBlur={(e) => changerChamp(p, "commentaire", e.target.value)}
                              />
                            </td>
                            <td data-label="Testé" style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                              {p.testePar ? (
                                <>
                                  {p.testePar}
                                  <br />
                                  {formatDateHeure(p.testeLe)}
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {peutGerer && (
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button
                                    className="btn-ghost"
                                    onClick={() => {
                                      setPointEnEdition(p);
                                      setAfficherFormPoint(true);
                                    }}
                                  >
                                    Modifier
                                  </button>
                                  <button className="btn-ghost btn-danger" onClick={() => supprimerPoint(p)}>
                                    Supprimer
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {afficherFormEquipement && (
        <TestEquipementFormModal
          equipement={equipementEnEdition}
          chantierId={chantierId}
          onClose={() => setAfficherFormEquipement(false)}
        />
      )}
      {afficherFormPoint && equipementSelectionne && (
        <PointFormModal
          testEquipementId={equipementSelectionne.id}
          chantierId={chantierId}
          point={pointEnEdition}
          nbExistants={pointsEquipement.length}
          onClose={() => setAfficherFormPoint(false)}
        />
      )}
      {afficherImport && equipementSelectionne && (
        <ImportPointsModal
          testEquipementId={equipementSelectionne.id}
          chantierId={chantierId}
          nbExistants={pointsEquipement.length}
          onClose={() => setAfficherImport(false)}
        />
      )}
      {afficherImportExcel && (
        <ImportTestsExcelModal
          points={pointsChantier}
          nomTesteur={nomTesteur}
          onClose={() => setAfficherImportExcel(false)}
        />
      )}
    </section>
  );
}
