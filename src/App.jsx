import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Planning from "./pages/Planning";
import ReservesGlobal from "./pages/ReservesGlobal";
import Notes from "./pages/Notes";
import ElectriciteNotes from "./pages/ElectriciteNotes";
import Users from "./pages/Users";
import Statistiques from "./pages/Statistiques";
import { ListeChantiersElec, FicheChantierElec, AccueilAutomatisme, ListeChantiersAutomatisme, FicheChantierAutomatisme, TachesAutomatisme } from "./pages/mobile/Aiguillage";
import ElectricitePlanDeCharge from "./pages/ElectricitePlanDeCharge";
import ElectriciteImportSap from "./pages/ElectriciteImportSap";
import EspaceClient from "./pages/EspaceClient";
import Aide from "./pages/Aide";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/connexion" element={<Login />} />
          <Route
            path="/espace-client"
            element={
              <ProtectedRoute requireClient>
                <EspaceClient />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute blockClient>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AccueilAutomatisme />} />
            <Route path="chantiers" element={<ListeChantiersAutomatisme />} />
            <Route path="chantiers/:chantierId" element={<FicheChantierAutomatisme />} />
            <Route path="taches" element={<TachesAutomatisme />} />
            <Route path="planning" element={<Planning />} />
            <Route path="reserves" element={<ReservesGlobal />} />
            <Route path="notes" element={<Notes />} />
            <Route path="aide" element={<Aide />} />
            <Route path="electricite" element={<ListeChantiersElec />} />
            <Route path="electricite/chantiers/:chantierId" element={<FicheChantierElec />} />
            <Route path="electricite/plan-de-charge" element={<ElectricitePlanDeCharge />} />
            <Route path="electricite/import-sap" element={<ElectriciteImportSap />} />
            <Route path="electricite/notes" element={<ElectriciteNotes />} />
            <Route
              path="utilisateurs"
              element={
                <ProtectedRoute requireAdmin>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="statistiques"
              element={
                <ProtectedRoute requireAdmin>
                  <Statistiques />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
