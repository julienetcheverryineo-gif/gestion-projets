import { useMemo, useState } from "react";
import { useCollection } from "../lib/firestoreHooks";
import { normaliserAssignes } from "../lib/assignes";

export const PLAFOND_MENSUEL = 156;
const MS_JOUR = 86400000;

export function joursEntre(a, b) {
  return Math.round((new Date(b) - new Date(a)) / MS_JOUR);
}

// Formate une Date en "AAAA-MM-JJ" à partir de ses composants LOCAUX,
// plutôt que toISOString() (qui convertit en UTC et peut décaler d'un jour
// selon le fuseau horaire — la France est UTC+1/+2, ce qui ferait glisser
// minuit local vers la veille en UTC).
export function formatDateLocale(date) {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return annee + "-" + mois + "-" + jour;
}

function moisCle(dateStr) {
  if (!dateStr) return null;
  return dateStr.slice(0, 7); // "AAAA-MM"
}

export function libelleMois(cle) {
  const [annee, mois] = cle.split("-");
  const noms = [
    "Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin",
    "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc.",
  ];
  return noms[Number(mois) - 1] + " " + annee;
}

export function arrondirHeures(h) {
  return Math.round(h * 10) / 10;
}

// "Client - Nom du chantier" (juste le nom si aucun client renseigné).
export function libelleChantier(chantier) {
  if (!chantier) return "À affecter";
  return chantier.client ? chantier.client + " - " + chantier.nom : chantier.nom;
}

// Répartit les heures d'une tâche entre les mois qu'elle couvre, au
// prorata du nombre de jours dans chacun. Une tâche du 01/01 au 01/03 pour
// 16h ne met donc pas les 16h en janvier : elle en met une petite part sur
// chacun des trois mois traversés, proportionnellement à leur nombre de
// jours dans la période. Si une seule date (ou aucune) est connue, tout va
// sur ce mois-là (ou en "non planifié").
function repartirHeuresParMois(dateDebut, echeance, heures) {
  const debut = dateDebut && echeance && echeance >= dateDebut ? dateDebut : null;
  if (!debut) {
    const cle = moisCle(dateDebut) || moisCle(echeance);
    return cle ? { [cle]: heures } : {};
  }
  const totalJours = joursEntre(dateDebut, echeance) + 1; // bornes incluses
  const joursParMois = {};
  let curseur = new Date(dateDebut);
  const fin = new Date(echeance);
  while (curseur <= fin) {
    const cle = formatDateLocale(curseur).slice(0, 7);
    joursParMois[cle] = (joursParMois[cle] || 0) + 1;
    curseur = new Date(curseur.getFullYear(), curseur.getMonth(), curseur.getDate() + 1);
  }
  const resultat = {};
  for (const [cle, jours] of Object.entries(joursParMois)) {
    resultat[cle] = (heures * jours) / totalJours;
  }
  return resultat;
}

// Toutes les données et tous les calculs partagés entre les pages
// Planning consolidé, Planning détaillé et Charge du service : chargement
// Firestore, fusion des tâches d'équipement régulé, filtre par chantier,
// timeline du Gantt (détail + agrégat par chantier) et charge mensuelle.
export function usePlanningData() {
  const { documents: taches, chargement } = useCollection("tasks");
  const { documents: chantiers } = useCollection("sites");
  const { documents: regItems } = useCollection("regitems");
  const { documents: regEquipements } = useCollection("regequipements");
  const { documents: utilisateurs } = useCollection("users", "email");
  const [chantierFiltre, setChantierFiltre] = useState("tous");

  const chantierParId = (id) => chantiers.find((c) => c.id === id);
  const nomChantier = (id) => libelleChantier(chantierParId(id));

  // Un nom est "électricien" soit parce que le compte applicatif associé a
  // ce rôle, soit (le plus souvent) parce qu'il ne correspond à aucun
  // compte — les électriciens externes étant de simples noms libres sur le
  // chantier, sans compte. Tout le reste (automaticien, chef de projet,
  // admin, ou un nom qui matche un compte sans rôle électricien) est classé
  // "automaticien" au sens large de l'équipe interne.
  const typePersonne = (nom) => {
    const u = utilisateurs.find((u) => u.nom === nom);
    if (u) return u.role === "electricien" ? "electricien" : "automaticien";
    return "electricien";
  };

  // Tâches d'équipement régulé fusionnées (pour la charge — elles n'ont
  // jamais de dates, donc jamais sur le Gantt, mais leurs heures comptent).
  const tachesRegitems = useMemo(
    () =>
      regItems
        .filter((it) => it.type === "tache")
        .map((it) => {
          const equip = regEquipements.find((r) => r.id === it.regEquipementId);
          return {
            id: it.id,
            _source: "regitem",
            titre: it.designation,
            chantierId: equip?.chantierId ?? null,
            assigneA: it.assigneA || null,
            heuresPrevues: it.heuresPrevues ?? null,
            dateDebut: null,
            echeance: null,
            statut: it.statut === "fait" ? "termine" : "a_faire",
          };
        }),
    [regItems, regEquipements]
  );

  const toutesLesTaches = useMemo(
    () => [...taches, ...tachesRegitems],
    [taches, tachesRegitems]
  );

  const tachesVisibles = useMemo(
    () =>
      chantierFiltre === "tous"
        ? toutesLesTaches
        : toutesLesTaches.filter((t) => t.chantierId === chantierFiltre),
    [toutesLesTaches, chantierFiltre]
  );

  // ---------- Gantt ----------
  const tachesGantt = useMemo(
    () => tachesVisibles.filter((t) => t.dateDebut && t.echeance && t.echeance >= t.dateDebut),
    [tachesVisibles]
  );
  const tachesSansDatesCompletes = tachesVisibles.filter(
    (t) => !(t.dateDebut && t.echeance && t.echeance >= t.dateDebut)
  );

  const gantt = useMemo(() => {
    if (tachesGantt.length === 0) return null;
    const debuts = tachesGantt.map((t) => t.dateDebut);
    const fins = tachesGantt.map((t) => t.echeance);
    const dateMin = debuts.reduce((a, b) => (a < b ? a : b));
    const dateMax = fins.reduce((a, b) => (a > b ? a : b));
    const debutTimeline = dateMin.slice(0, 8) + "01";
    const finDate = new Date(dateMax);
    const finTimeline = formatDateLocale(
      new Date(finDate.getFullYear(), finDate.getMonth() + 1, 0)
    );
    const totalJours = Math.max(1, joursEntre(debutTimeline, finTimeline));
    const pxParJour = totalJours > 180 ? 6 : totalJours > 90 ? 10 : 18;
    const largeurTotale = totalJours * pxParJour;

    const mois = [];
    let curseur = new Date(debutTimeline);
    const finObj = new Date(finTimeline);
    while (curseur <= finObj) {
      const cle = formatDateLocale(curseur).slice(0, 7);
      const debutMoisStr = formatDateLocale(curseur);
      mois.push({
        cle,
        label: libelleMois(cle),
        left: joursEntre(debutTimeline, debutMoisStr) * pxParJour,
      });
      curseur = new Date(curseur.getFullYear(), curseur.getMonth() + 1, 1);
    }

    const parChantier = new Map();
    for (const t of tachesGantt) {
      const cle = t.chantierId || "aaffecter";
      if (!parChantier.has(cle)) {
        parChantier.set(cle, { nom: nomChantier(t.chantierId), taches: [] });
      }
      parChantier.get(cle).taches.push(t);
    }
    for (const groupe of parChantier.values()) {
      groupe.taches.sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
    }

    // Vue agrégée : une barre par chantier (du plus tôt au plus tard parmi
    // ses tâches datées), avec le total d'heures de TOUTES ses tâches
    // (datées ou non, pour refléter la charge réelle même si la barre en
    // elle-même ne peut se positionner qu'à partir des tâches datées).
    const chantierBars = [...parChantier.entries()].map(([cle, groupe]) => {
      const debut = groupe.taches[0].dateDebut;
      const fin = groupe.taches.reduce(
        (max, t) => (t.echeance > max ? t.echeance : max),
        groupe.taches[0].echeance
      );
      const heuresTotal = tachesVisibles
        .filter((t) => (t.chantierId || "aaffecter") === cle)
        .reduce((s, t) => s + Number(t.heuresPrevues || 0), 0);
      return {
        cle,
        nom: groupe.nom,
        debut,
        fin,
        left: joursEntre(debutTimeline, debut) * pxParJour,
        largeur: Math.max(6, (joursEntre(debut, fin) + 1) * pxParJour),
        heuresTotal,
      };
    });

    // Vue par personne : une tâche apparaît dans la ligne de chacun de ses
    // responsables (une tâche à deux personnes apparaît deux fois, une par
    // ligne — c'est bien le planning de CHAQUE personne qu'on regarde).
    const parPersonne = new Map();
    for (const t of tachesGantt) {
      const noms = normaliserAssignes(t.assigneA);
      const cles = noms.length > 0 ? noms : ["aaffecter"];
      for (const nom of cles) {
        if (!parPersonne.has(nom)) {
          parPersonne.set(nom, {
            nom: nom === "aaffecter" ? "À affecter" : nom,
            type: nom === "aaffecter" ? "automaticien" : typePersonne(nom),
            taches: [],
          });
        }
        parPersonne.get(nom).taches.push(t);
      }
    }
    for (const groupe of parPersonne.values()) {
      groupe.taches.sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
    }
    const personneGroupes = [...parPersonne.values()].sort((a, b) => b.taches.length - a.taches.length);

    const aujourdHui = formatDateLocale(new Date());
    const ligneAujourdHui =
      aujourdHui >= debutTimeline && aujourdHui <= finTimeline
        ? joursEntre(debutTimeline, aujourdHui) * pxParJour
        : null;

    return {
      debutTimeline,
      pxParJour,
      largeurTotale,
      mois,
      parChantier,
      chantierBars,
      personneGroupes,
      ligneAujourdHui,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tachesGantt, tachesVisibles, chantiers, utilisateurs]);

  // ---------- Charge du service (par personne) ----------
  const charge = useMemo(() => {
    const parPersonne = new Map();
    for (const t of tachesVisibles) {
      const heures = Number(t.heuresPrevues || 0);
      if (heures <= 0) continue;
      const noms = normaliserAssignes(t.assigneA);
      if (noms.length === 0) continue;
      const repartition = repartirHeuresParMois(t.dateDebut, t.echeance, heures);
      const totalReparti = Object.values(repartition).reduce((s, h) => s + h, 0);
      const resteNonPlanifie = heures - totalReparti;
      for (const nom of noms) {
        if (!parPersonne.has(nom)) {
          parPersonne.set(nom, {
            nom,
            type: typePersonne(nom),
            parMois: {},
            detailParMois: {},
            nonPlanifie: 0,
            detailNonPlanifie: [],
            total: 0,
          });
        }
        const entree = parPersonne.get(nom);
        entree.total += heures;
        for (const [cle, h] of Object.entries(repartition)) {
          entree.parMois[cle] = (entree.parMois[cle] || 0) + h;
          if (!entree.detailParMois[cle]) entree.detailParMois[cle] = [];
          entree.detailParMois[cle].push({
            id: t.id,
            titre: t.titre,
            chantierId: t.chantierId,
            heures: h,
            statut: t.statut,
            dateDebut: t.dateDebut,
            echeance: t.echeance,
          });
        }
        if (resteNonPlanifie > 0) {
          entree.nonPlanifie += resteNonPlanifie;
          entree.detailNonPlanifie.push({
            id: t.id,
            titre: t.titre,
            chantierId: t.chantierId,
            heures: resteNonPlanifie,
            statut: t.statut,
          });
        }
      }
    }
    const tousLesMois = new Set();
    for (const p of parPersonne.values()) {
      for (const cle of Object.keys(p.parMois)) tousLesMois.add(cle);
    }
    const moisTries = [...tousLesMois].sort();
    const toutes = [...parPersonne.values()].sort((a, b) => b.total - a.total);
    return {
      moisTries,
      personnes: toutes,
      automaticiens: toutes.filter((p) => p.type === "automaticien"),
      electriciens: toutes.filter((p) => p.type === "electricien"),
    };
  }, [tachesVisibles, utilisateurs]);

  return {
    chargement,
    chantiers,
    chantierFiltre,
    setChantierFiltre,
    tachesGantt,
    tachesSansDatesCompletes,
    toutesLesTaches,
    utilisateurs,
    gantt,
    charge,
    nomChantier,
  };
}
