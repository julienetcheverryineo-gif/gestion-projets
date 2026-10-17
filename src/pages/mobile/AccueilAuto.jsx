import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useDonneesAuto, tacheEnRetard } from "../../lib/useDonneesAuto";
import { FeuilleSynchro, PuceSynchro, Squelette } from "../../components/mobile/Ui";
import { ListeTaches } from "./TachesAuto";
import { CarteChantierAuto } from "./ChantiersAuto";

// Accueil : l'état du jour en un coup d'œil.
export default function AccueilAuto() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const d = useDonneesAuto(profile);
  const [synchro, setSynchro] = useState(false);
  const prenom = (profile?.nom || "").split(" ")[0];
  const actifs = d.chantiers.filter((c) => c.statut !== "termine");
  const ids = new Set(d.chantiers.map((c) => c.id));
  const tachesChantiers = d.taches.filter((t) => ids.has(t.chantierId));
  const nbRetard = tachesChantiers.filter(tacheEnRetard).length;
  const reservesOuvertes = d.reserves.filter((r) => ids.has(r.chantierId) && r.statut !== "levee").length;
  const tests = d.testPoints.filter((p) => ids.has(p.chantierId));
  const ko = tests.filter((p) => p.statut === "ko").length;
  const restants = tests.filter((p) => !["ok", "ko", "annule"].includes(p.statut)).length;
  const mesUrgentes = d.mesTaches
    .filter((t) => t.statut !== "termine")
    .sort((a, b) => Number(tacheEnRetard(b)) - Number(tacheEnRetard(a)) || String(a.echeance || "9999").localeCompare(String(b.echeance || "9999")))
    .slice(0, 4);
  const miens = d.chantiers.filter((c) => d.resume[c.id].mien && c.statut !== "termine").slice(0, 5);

  return (
    <div className="m-page">
      <header className="m-entete">
        <div className="m-entete-ligne">
          <h1>{prenom ? "Bonjour " + prenom : "Accueil"}</h1>
          <PuceSynchro onClick={() => setSynchro(true)} />
        </div>
        <p className="m-entete-sous">Automatisme &amp; GTB</p>
      </header>
      {d.chargement ? (
        <Squelette />
      ) : (
        <div className="m-tour">
          <div className="m-tuiles">
            <button type="button" onClick={() => navigate("/chantiers")}>
              <b>{actifs.length}</b>
              <span>chantiers actifs</span>
            </button>
            <button type="button" className={nbRetard ? "alerte" : ""} onClick={() => navigate("/taches")}>
              <b>{nbRetard}</b>
              <span>tâches en retard</span>
            </button>
            <button type="button" className={ko ? "alerte" : ""} onClick={() => navigate("/chantiers")}>
              <b>{ko}</b>
              <span>tests KO · {restants} à faire</span>
            </button>
            <button type="button" onClick={() => navigate("/reserves")}>
              <b>{reservesOuvertes}</b>
              <span>réserves ouvertes</span>
            </button>
          </div>
          <h2 className="m-titre-section">Mes tâches</h2>
          <ListeTaches taches={mesUrgentes} chantiers={d.chantiers} afficherChantier vide="Rien à faire pour l'instant" />
          {d.mesTaches.filter((t) => t.statut !== "termine").length > 4 && (
            <button type="button" className="m-bouton-sec" onClick={() => navigate("/taches")}>
              Voir toutes mes tâches
            </button>
          )}
          {miens.length > 0 && (
            <>
              <h2 className="m-titre-section">Mes chantiers</h2>
              <ul className="m-cartes">
                {miens.map((c) => (
                  <CarteChantierAuto key={c.id} chantier={c} r={d.resume[c.id]} onOuvrir={() => navigate("/chantiers/" + c.id)} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {synchro && <FeuilleSynchro onFermer={() => setSynchro(false)} />}
    </div>
  );
}
