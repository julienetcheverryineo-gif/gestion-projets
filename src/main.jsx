import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./mobile.css";
import { demarrerSuiviConnexion, enregistrerServiceWorker } from "./lib/offline";

demarrerSuiviConnexion();
enregistrerServiceWorker();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
