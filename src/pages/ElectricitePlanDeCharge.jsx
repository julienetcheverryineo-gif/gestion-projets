import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "../lib/firestoreHooks";
import { estChantierElectricite } from "../components/SiteFormModal";

// Plan de charge Électricité — "option simple" : une seule date de fin
// prévue par chantier (fiche chantier), pas de saisie par électricien ni
// par ligne. Le reste à faire en main d'œuvre (Σ tempsTotalHeures × (1 -
// avancementMo%), même formule que le Bilan Main d'œuvre du chantier) est
// réparti automatiquement et à parts égales :
//  - entre les semaines ISO (lundi → dimanche) allant d'aujourd'hui (ou de
//    la date de début prévue si elle est future) jusqu'à la semaine de la
//    date de fin prévue — ou uniquement sur la semaine en cours si cette
//    date de fin est déjà passée ;
//  - entre les électriciens de l'équipe affectée au chantier (ou dans un
//    panier « À affecter » si aucune équipe n'est renseignée).
// La vue Mois regroupe ensuite les semaines par mois de leur lundi.
// Seuls les chantiers électricité non terminés avec une date de fin prévue
// renseignée apparaissent ici (voir la note dans la fiche chantier).

function lundiDeLaSemaine(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const jour = d.getDay();
  const diff = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + diff);
  return d;
}

function ajouterJours(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function cleSemaine(date) {
  const d = new Date(date);
  return (
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
  );
}

function libelleSemaine(date) {
  const fin = ajouterJours(date, 6);
  const fmt = (x) => x.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return fmt(date) + " – " + fmt(fin);
}

function cleMois(date) {
  const d = new Date(date);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function libelleMois(date) {
  const d = new Date(date);
  const s = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function arrondi1(n) {
  return Math.round(n * 10) / 10;
}

export default function ElectricitePlanDeCharge() {
  const { documents: tousChantiers, chargement: chargementChantiers } = useCollection("sites");
  const { documents: toutesLignes, chargement: chargementLignes } = useCollection("elecLignes");
  const [vue, setVue] = useState("semaine"); // "semaine" | "mois"

  const chargement = chargementChantiers || chargementLignes;

  const chantiersPlan = tousChantiers.filter(
    (c) => estChantierElectricite(c) && c.statut !== "termine" && c.dateFin
  );

  const { parPersonneSemaine, colonnesSemaine, detailChantiers } = useMemo(() => {
    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);
    const semaineCourante = lundiDeLaSemaine(aujourdHui);

    const parPersonne = new Map(); // nom -> Map(cleSemaine -> heures)
    const semainesVues = new Map(); // cle -> Date (lundi)
    const detail = [];

    for (const c of chantiersPlan) {
      const lignesChantier = toutesLignes.filter((l) => l.chantierId === c.id && !l.estPoste);
      const resteAFaire = lignesChantier.reduce((acc, l) => {
        const pctMo = (l.avancementMo ?? l.avancement ?? 0) / 100;
        return acc + (l.tempsTotalHeures || 0) * Math.max(0, 1 - pctMo);
      }, 0);

      if (resteAFaire <= 0) continue;

      const dateFin = new Date(c.dateFin);
      const dateDebutSaisie = c.dateDebut ? new Date(c.dateDebut) : null;
      const debutEffectif =
        dateDebutSaisie && dateDebutSaisie > aujourdHui ? dateDebutSaisie : aujourdHui;

      let semaines;
      if (dateFin < aujourdHui) {
        // Date de fin déjà dépassée : tout le reste à faire est ramené sur
        // la semaine en cours pour rester visible plutôt que d'être perdu.
        semaines = [semaineCourante];
      } else {
        const semaineDebut = lundiDeLaSemaine(debutEffectif);
        const semaineFin = lundiDeLaSemaine(dateFin);
        semaines = [];
        for (let s = new Date(semaineDebut); s <= semaineFin; s = ajouterJours(s, 7)) {
          semaines.push(new Date(s));
        }
        if (semaines.length === 0) semaines = [semaineDebut];
      }

      const equipe = c.equipeElectriciens?.length > 0 ? c.equipeElectriciens : ["À affecter"];
      const heuresParPersonneEtParSemaine = resteAFaire / equipe.length / semaines.length;

      for (const semaine of semaines) {
        const cle = cleSemaine(semaine);
        if (!semainesVues.has(cle)) semainesVues.set(cle, semaine);
        for (const nom of equipe) {
          if (!parPersonne.has(nom)) parPersonne.set(nom, new Map());
          const m = parPersonne.get(nom);
          m.set(cle, (m.get(cle) || 0) + heuresParPersonneEtParSemaine);
        }
      }

      detail.push({
        chantier: c,
        resteAFaire: arrondi1(resteAFaire),
        equipe,
        nbSemaines: semaines.length,
        dateFinDepassee: dateFin < aujourdHui,
      });
    }

    const colonnes = [...semainesVues.values()].sort((a, b) => a - b);
    return { parPersonneSemaine: parPersonne, colonnesSemaine: colonnes, detailChantiers: detail };
  }, [chantiersPlan, toutesLignes]);

  const { parPersonneAffichee, colonnesAffichees } = useMemo(() => {
    if (vue === "semaine") {
      return { parPersonneAffichee: parPersonneSemaine, colonnesAffichees: colonnesSemaine };
    }
    // Vue Mois : chaque semaine est rattachée au mois de son lundi.
    const parPersonneMois = new Map();
    const moisVus = new Map();
    for (const [nom, parSemaine] of parPersonneSemaine.entries()) {
      const m = new Map();
      for (const [cleS, heures] of parSemaine.entries()) {
        const dateSemaine = colonnesSemaine.find((d) => cleSemaine(d) === cleS);
        if (!dateSemaine) continue;
        const cleM = cleMois(dateSemaine);
        if (!moisVus.has(cleM)) moisVus.set(cleM, new Date(dateSemaine.getFullYear(), dateSemaine.getMonth(), 1));
        m.set(cleM, (m.get(cleM) || 0) + heures);
      }
      parPersonneMois.set(nom, m);
    }
    const colonnes = [...moisVus.values()].sort((a, b) => a - b);
    return { parPersonneAffichee: parPersonneMois, colonnesAffichees: colonnes };
  }, [vue, parPersonneSemaine, colonnesSemaine]);

  const cleColonne = vue === "semaine" ? cleSemaine : cleMois;
  const libelleColonne = vue === "semaine" ? libelleSemaine : libelleMois;

  const lignesPersonnes = [...parPersonneAffichee.entries()]
    .map(([nom, parColonne]) => {
      const total = [...parColonne.values()].reduce((a, b) => a + b, 0);
      return { nom, parColonne, total };
    })
    .sort((a, b) => b.total - a.total);

  const totauxParColonne = colonnesAffichees.map((col) => {
    const cle = cleColonne(col);
    return lignesPersonnes.reduce((acc, p) => acc + (p.parColonne.get(cle) || 0), 0);
  });

  return (
    <div className="page">
      <header className="page-header page-header-actions">
        <div>
          <h1>Plan de charge — Électricité</h1>
          <p className="page-subtitle">
            Répartition automatique du reste à faire en main d'œuvre, par électricien.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className={"btn-ghost" + (vue === "semaine" ? " btn-espace-actif" : "")}
            onClick={() => setVue("semaine")}
          >
            Semaine
          </button>
          <button
            type="button"
            className={"btn-ghost" + (vue === "mois" ? " btn-espace-actif" : "")}
            onClick={() => setVue("mois")}
          >
            Mois
          </button>
        </div>
      </header>

      {chargement ? (
        <div className="page-loading">Chargement…</div>
      ) : chantiersPlan.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Aucun chantier à planifier</p>
          <p className="empty-state-description">
            Renseignez une date de fin prévue dans la fiche d'un chantier électricité (non
            terminé) pour qu'il apparaisse dans le plan de charge.
          </p>
        </div>
      ) : lignesPersonnes.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Rien à planifier pour l'instant</p>
          <p className="empty-state-description">
            Les chantiers avec une date de fin prévue n'ont plus de reste à faire en main
            d'œuvre (100 % d'avancement).
          </p>
        </div>
      ) : (
        <>
          <div className="data-table-wrapper">
            <table className="data-table plan-charge-table">
              <thead>
                <tr>
                  <th>Électricien</th>
                  {colonnesAffichees.map((col) => (
                    <th key={cleColonne(col)}>{libelleColonne(col)}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {lignesPersonnes.map((p) => (
                  <tr key={p.nom}>
                    <td data-label="Électricien" style={{ fontFamily: "var(--font-ui)", fontWeight: 500 }}>
                      {p.nom}
                    </td>
                    {colonnesAffichees.map((col) => {
                      const cle = cleColonne(col);
                      const heures = p.parColonne.get(cle) || 0;
                      return (
                        <td key={cle} data-label={libelleColonne(col)}>
                          {heures > 0 ? arrondi1(heures) + " h" : "—"}
                        </td>
                      );
                    })}
                    <td data-label="Total" style={{ fontWeight: 600 }}>
                      {arrondi1(p.total)} h
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}>Total</td>
                  {totauxParColonne.map((t, i) => (
                    <td key={i} style={{ color: "var(--text-muted)" }}>
                      {t > 0 ? arrondi1(t) + " h" : "—"}
                    </td>
                  ))}
                  <td style={{ fontWeight: 600 }}>
                    {arrondi1(totauxParColonne.reduce((a, b) => a + b, 0))} h
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="form-divider" style={{ marginTop: 28 }}>
            Chantiers pris en compte
          </div>
          <div className="lot-list">
            {detailChantiers.map(({ chantier, resteAFaire, equipe, dateFinDepassee }) => (
              <div key={chantier.id} className="lot-card">
                <div className="lot-card-header" style={{ cursor: "default" }}>
                  <div>
                    <strong>
                      <Link to={"/electricite/chantiers/" + chantier.id}>{chantier.nom}</Link>
                    </strong>
                    <span className="simple-list-meta" style={{ marginLeft: 10 }}>
                      {equipe.join(", ")} · fin prévue le{" "}
                      {new Date(chantier.dateFin).toLocaleDateString("fr-FR")}
                      {dateFinDepassee ? " (dépassée — reporté sur la semaine en cours)" : ""}
                    </span>
                  </div>
                  <span className="kanban-count">{resteAFaire} h</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
