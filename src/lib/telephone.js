import { useEffect, useState } from "react";

// Vue téléphone : écrans ≤ 640 px. (Les tablettes gardent la vue complète.)
// L'utilisateur peut forcer la vue complète depuis le menu de la vue mobile.
const REQUETE = "(max-width: 640px)";
const CLE_VUE_COMPLETE = "vueCompleteForcee";

function lireForcee() {
  try {
    return localStorage.getItem(CLE_VUE_COMPLETE) === "1";
  } catch {
    return false;
  }
}
export function forcerVueComplete(valeur) {
  try {
    localStorage.setItem(CLE_VUE_COMPLETE, valeur ? "1" : "0");
  } catch {
    // stockage indisponible
  }
  window.dispatchEvent(new Event("vue-mobile-change"));
}
export function etroitMaintenant() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(REQUETE).matches;
}

// true = afficher l'interface téléphone.
export function useTelephone() {
  const [etroit, setEtroit] = useState(etroitMaintenant);
  const [forcee, setForcee] = useState(lireForcee);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(REQUETE);
    const surMq = (e) => setEtroit(e.matches);
    const surForcee = () => setForcee(lireForcee());
    mq.addEventListener("change", surMq);
    window.addEventListener("vue-mobile-change", surForcee);
    return () => {
      mq.removeEventListener("change", surMq);
      window.removeEventListener("vue-mobile-change", surForcee);
    };
  }, []);
  return etroit && !forcee;
}
export function vueCompleteForcee() {
  return lireForcee();
}
