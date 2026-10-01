import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCollection } from "../lib/firestoreHooks";
import { estChantierElectricite } from "../components/SiteFormModal";
import { heuresJournalieres, capaciteSemaine } from "../lib/joursOuvres";

// Plan de charge Électricité — "option simple" : une seule date de fin
// prévue par chantier (fiche chantier), pas de saisie par électricien ni
// par ligne. Le reste à faire en main d'œuvre (Σ tempsTotalHeures × (1 -
// avancementMo%), même formule que le Bilan Main d'œuvre du chantier —
// ou, à défaut de devis importé, le champ « Heures MO prévues » saisi
// directement sur la fiche chantier) est réparti automatiquement :
//  - au prorata des jours réellement travaillés (8h lundi→jeudi, 4h le
//    vendredi, 0h les week-ends et jours fériés — voir lib/joursOuvres)
//    entre aujourd'hui (ou la date de début prévue si elle est future) et
//    la date de fin prévue, de sorte qu'une semaine incomplète (jour
//    férié, début/fin de chantier en milieu de semaine) porte moins
//    d'heures qu'une semaine pleine ; si la date de fin est déjà passée,
//    tout le reste à faire est ramené sur la semaine en cours ;
//  - à parts égales entre les électriciens de l'équipe affectée au
//    chantier (ou dans un panier « À affecter » si aucune équipe n'est
//    renseignée).
// La ligne « Effectif nécessaire » convertit les heures en nombre
// d'électriciens équivalent temps plein, en comparant à la capacité
// réelle de la période (36h/semaine, moins les jours fériés).
// La vue Mois regroupe les semaines par mois de leur lundi.
// Seuls les chantiers électricité non terminés avec une date de fin
// prévue renseignée apparaissent ici (voir la note dans la fiche
// chantier).

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

// Reste à faire en main d'œuvre d'un chantier : calculé depuis les lignes
// de devis importées (Σ temps × (1 - avancement)) quand il y en a, sinon
// repli sur le champ « Heures MO prévues » saisi à la main sur la fiche
// chantier (chantier déclaré sans devis importé).
function resteAFaireChantier(chantier, toutesLignes) {
  const lignesChantier = toutesLignes.filter((l) => l.chantierId === chantier.id && !l.estPoste);
  if (lignesChantier.length > 0) {
    return lignesChantier.reduce((acc, l) => {
      const pctMo = (l.avancementMo ?? l.avancement ?? 0) / 100;
      return acc + (l.tempsTotalHeures || 0) * Math.max(0, 1 - pctMo);
    }, 0);
  }
  return Number(chantier.heuresMoPrevisionnelles || 0);
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
      const resteAFaire = resteAFaireChantier(c, toutesLignes);
      if (resteAFaire <= 0) continue;

      const dateFin = new Date(c.dateFin);
      const dateDebutSaisie = c.dateDebut ? new Date(c.dateDebut) : null;
      const debutEffectif =
        dateDebutSaisie && dateDebutSaisie > aujourdHui ? dateDebutSaisie : aujourdHui;

      // cle de semaine -> heures de CE chantier sur cette semaine, au
      // prorata des jours réellement travaillés (voir en-tête du fichier).
      const heuresParSemaineChantier = new Map();
      const dateFinDepassee = dateFin < aujourdHui;

      if (dateFinDepassee) {
        heuresParSemaineChantier.set(cleSemaine(semaineCourante), resteAFaire);
        if (!semainesVues.has(cleSemaine(semaineCourante))) {
          semainesVues.set(cleSemaine(semaineCourante), semaineCourante);
        }
      } else {
        let totalCapaciteJours = 0;
        const joursValides = [];
        for (let d = new Date(debutEffectif); d <= dateFin; d = ajouterJours(d, 1)) {
          const h = heuresJournalieres(d);
          if (h > 0) {
            totalCapaciteJours += h;
            joursValides.push({ date: new Date(d), heures: h });
          }
        }
        if (totalCapaciteJours === 0) {
          // Pas un seul jour travaillé dans l'intervalle (ex : chantier sur
          // un seul jour férié / week-end) : on reporte tout sur la
          // semaine de début pour ne rien perdre.
          const semaineRepli = lundiDeLaSemaine(debutEffectif);
          const cle = cleSemaine(semaineRepli);
          heuresParSemaineChantier.set(cle, resteAFaire);
          if (!semainesVues.has(cle)) semainesVues.set(cle, semaineRepli);
        } else {
          for (const j of joursValides) {
            const semaine = lundiDeLaSemaine(j.date);
            const cle = cleSemaine(semaine);
            const part = resteAFaire * (j.heures / totalCapaciteJours);
            heuresParSemaineChantier.set(cle, (heuresParSemaineChantier.get(cle) || 0) + part);
            if (!semainesVues.has(cle)) semainesVues.set(cle, semaine);
          }
        }
      }

      const equipe = c.equipeElectriciens?.length > 0 ? c.equipeElectriciens : ["À affecter"];

      for (const [cle, heuresSemaine] of heuresParSemaineChantier.entries()) {
        const heuresParPersonne = heuresSemaine / equipe.length;
        for (const nom of equipe) {
          if (!parPersonne.has(nom)) parPersonne.set(nom, new Map());
          const m = parPersonne.get(nom);
          m.set(cle, (m.get(cle) || 0) + heuresParPersonne);
        }
      }

      detail.push({
        chantier: c,
        resteAFaire: arrondi1(resteAFaire),
        equipe,
        dateFinDepassee,
        sansDevis: toutesLignes.filter((l) => l.chantierId === c.id && !l.estPoste).length === 0,
      });
    }

    const colonnes = [...semainesVues.values()].sort((a, b) => a - b);
    return { parPersonneSemaine: parPersonne, colonnesSemaine: colonnes, detailChantiers: detail };
  }, [chantiersPlan, toutesLignes]);

  const { parPersonneAffichee, colonnesAffichees, capacitesColonnes } = useMemo(() => {
    if (vue === "semaine") {
      const capacites = colonnesSemaine.map((s) => capaciteSemaine(s));
      return { parPersonneAffichee: parPersonneSemaine, colonnesAffichees: colonnesSemaine, capacitesColonnes: capacites };
    }
    // Vue Mois : chaque semaine est rattachée au mois de son lundi, les
    // heures ET la capacité des semaines qui le composent sont cumulées.
    const parPersonneMois = new Map();
    const moisVus = new Map();
    const capaciteParMois = new Map();
    for (const semaine of colonnesSemaine) {
      const cleM = cleMois(semaine);
      if (!moisVus.has(cleM)) moisVus.set(cleM, new Date(semaine.getFullYear(), semaine.getMonth(), 1));
      capaciteParMois.set(cleM, (capaciteParMois.get(cleM) || 0) + capaciteSemaine(semaine));
    }
    for (const [nom, parSemaine] of parPersonneSemaine.entries()) {
      const m = new Map();
      for (const [cleS, heures] of parSemaine.entries()) {
        const dateSemaine = colonnesSemaine.find((d) => cleSemaine(d) === cleS);
        if (!dateSemaine) continue;
        const cleM = cleMois(dateSemaine);
        m.set(cleM, (m.get(cleM) || 0) + heures);
      }
      parPersonneMois.set(nom, m);
    }
    const colonnes = [...moisVus.values()].sort((a, b) => a - b);
    const capacites = colonnes.map((d) => capaciteParMois.get(cleMois(d)) || 0);
    return { parPersonneAffichee: parPersonneMois, colonnesAffichees: colonnes, capacitesColonnes: capacites };
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

  const effectifParColonne = totauxParColonne.map((total, i) => {
    const capacite = capacitesColonnes[i];
    return capacite > 0 ? total / capacite : null;
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
            d'œuvre (100 % d'avancement, ou aucune heure MO prévue renseignée).
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
                  <td data-label="Électricien" style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}>
                    Total
                  </td>
                  {colonnesAffichees.map((col, i) => (
                    <td key={cleColonne(col)} data-label={libelleColonne(col)} style={{ color: "var(--text-muted)" }}>
                      {totauxParColonne[i] > 0 ? arrondi1(totauxParColonne[i]) + " h" : "—"}
                    </td>
                  ))}
                  <td data-label="Total" style={{ fontWeight: 600 }}>
                    {arrondi1(totauxParColonne.reduce((a, b) => a + b, 0))} h
                  </td>
                </tr>
                <tr>
                  <td
                    data-label="Électricien"
                    style={{ fontFamily: "var(--font-ui)", color: "var(--text-muted)" }}
                    title="Heures totales de la période ÷ capacité d'un électricien sur cette période (36h/semaine, jours fériés déduits)."
                  >
                    Effectif nécessaire (ETP)
                  </td>
                  {colonnesAffichees.map((col, i) => (
                    <td key={cleColonne(col)} data-label={libelleColonne(col)} style={{ color: "var(--text-muted)" }}>
                      {effectifParColonne[i] !== null ? arrondi1(effectifParColonne[i]) : "—"}
                    </td>
                  ))}
                  <td data-label="Total"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="form-divider" style={{ marginTop: 28 }}>
            Chantiers pris en compte
          </div>
          <div className="lot-list">
            {detailChantiers.map(({ chantier, resteAFaire, equipe, dateFinDepassee, sansDevis }) => (
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
                      {sansDevis ? " · sans devis importé (heures saisies à la main)" : ""}
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
