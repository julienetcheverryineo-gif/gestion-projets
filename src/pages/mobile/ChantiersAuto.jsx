import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useDonneesAuto } from "../../lib/useDonneesAuto";
import { formatStatutChantier } from "../../components/SiteFormModal";
import { Barre, FeuilleSynchro, PuceSynchro, Squelette, pct0 } from "../../components/mobile/Ui";
import { IcCheck, IcChantiers, IcRecherche } from "../../components/mobile/Icones";

const norm = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function CarteChantierAuto({ chantier: c, r, onOuvrir }) {
  const alertes = (r.tachesRetard || 0) + (r.reservesRetard || 0) + (r.tests.ko || 0);
  return (
    <li>
      <button type="button" className={"m-carte" + (r.tests.ko > 0 || r.tachesRetard > 0 ? " warn" : "")} onClick={onOuvrir}>
        <div className="m-carte-tete">
          <span className={"m-pastille-statut status-" + (c.statut ?? "actif")} title={formatStatutChantier(c.statut)} />
          <div className="m-carte-titres">
            <strong>{c.nom}</strong>
            <span>{[c.client, c.compte].filter(Boolean).join(" · ") || "—"}</span>
          </div>
          {alertes > 0 ? (
            <span className="m-badge-alerte">{alertes}</span>
          ) : (
            <span className="m-badge-ok">
              <IcCheck taille={15} />
            </span>
          )}
        </div>
        <div className="m-trio duo">
          <div className="m-jauge">
            <b className="m-jauge-val">{r.avancement == null ? "—" : pct0(r.avancement)}</b>
            <span className="m-jauge-lib">Avancement</span>
            <Barre valeur={r.avancement ?? 0} fin />
          </div>
          <div className="m-jauge">
            <b className="m-jauge-val">{r.tests.pct == null ? "—" : r.tests.pct + " %"}</b>
            <span className="m-jauge-lib">Tests</span>
            <Barre valeur={r.tests.pct ?? 0} fin couleur="var(--m-bleu)" />
          </div>
        </div>
        {alertes + r.reservesOuvertes > 0 && (
          <span className="m-puces">
            {r.tests.ko > 0 && <span className="m-puce danger">{r.tests.ko} KO</span>}
            {r.tachesRetard > 0 && <span className="m-puce warn">{r.tachesRetard} tâche(s) en retard</span>}
            {r.reservesOuvertes > 0 && <span className="m-puce violet">{r.reservesOuvertes} réserve(s)</span>}
          </span>
        )}
      </button>
    </li>
  );
}

// Liste des chantiers Automatisme & GTB, version téléphone.
export default function ChantiersAuto() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const d = useDonneesAuto(profile);
  const [tous, setTous] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [synchro, setSynchro] = useState(false);

  const liste = useMemo(() => {
    const q = norm(recherche).trim();
    const aucun = d.chantiers.filter((c) => d.resume[c.id]?.mien).length === 0;
    return d.chantiers
      .filter((c) => (tous || aucun || d.resume[c.id]?.mien) && (!q || norm([c.nom, c.client, c.compte].join(" ")).includes(q)))
      .slice()
      .sort((a, b) => {
        const ra = d.resume[a.id];
        const rb = d.resume[b.id];
        const sa = ra.tests.ko * 3 + ra.tachesRetard * 2 + ra.reservesRetard;
        const sb = rb.tests.ko * 3 + rb.tachesRetard * 2 + rb.reservesRetard;
        return sb - sa || String(a.nom).localeCompare(String(b.nom), "fr");
      });
  }, [d, tous, recherche]);

  return (
    <div className="m-page">
      <header className="m-entete">
        <div className="m-entete-ligne">
          <h1>Chantiers</h1>
          <PuceSynchro onClick={() => setSynchro(true)} />
        </div>
        <p className="m-entete-sous">{d.chargement ? "Chargement…" : liste.length + " chantier(s)"}</p>
        <label className="m-recherche">
          <IcRecherche taille={18} />
          <input type="search" placeholder="Chantier, client, n° de compte…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </label>
        <div className="m-segments" role="tablist">
          <button type="button" className={!tous ? "actif" : ""} onClick={() => setTous(false)}>
            Mes chantiers
          </button>
          <button type="button" className={tous ? "actif" : ""} onClick={() => setTous(true)}>
            Tous
          </button>
        </div>
      </header>
      {d.chargement ? (
        <Squelette />
      ) : liste.length === 0 ? (
        <div className="m-vide">
          <IcChantiers taille={34} />
          <strong>Aucun chantier</strong>
        </div>
      ) : (
        <ul className="m-cartes">
          {liste.map((c) => (
            <CarteChantierAuto key={c.id} chantier={c} r={d.resume[c.id]} onOuvrir={() => navigate("/chantiers/" + c.id)} />
          ))}
        </ul>
      )}
      {synchro && <FeuilleSynchro onFermer={() => setSynchro(false)} />}
    </div>
  );
}
