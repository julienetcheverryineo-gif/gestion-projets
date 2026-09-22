// Le glisser-déposer HTML5 natif ne fonctionne pas au doigt (iPhone,
// iPad...) et pire, l'attribut draggable posé sur un conteneur peut
// perturber la reconnaissance des taps sur les boutons qu'il contient.
// On le désactive entièrement sur les appareils tactiles et on ne compte
// que sur des boutons de remplacement (▲ Monter / ▼ Descendre) dans ce cas.
export const estTactile =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);
