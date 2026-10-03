import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Sites from "./pages/Sites";
import SiteDetail from "./pages/SiteDetail";
import Tasks from "./pages/Tasks";
import Planning from "./pages/Planning";
import ReservesGlobal from "./pages/ReservesGlobal";
import Notes from "./pages/Notes";
import Users from "./pages/Users";
import Statistiques from "./pages/Statistiques";
import ElectriciteChantiers from "./pages/ElectriciteChantiers";
import ElectriciteSiteDetail from "./pages/ElectriciteSiteDetail";
import ElectricitePlanDeCharge from "./pages/ElectricitePlanDeCharge";
import ElectriciteImportSap from "./pages/ElectriciteImportSap";
import EspaceClient from "./pages/EspaceClient";

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
            <Route index element={<Dashboard />} />
            <Route path="chantiers" element={<Sites />} />
            <Route path="chantiers/:chantierId" element={<SiteDetail />} />
            <Route path="taches" element={<Tasks />} />
            <Route path="planning" element={<Planning />} />
            <Route path="reserves" element={<ReservesGlobal />} />
            <Route path="notes" element={<Notes />} />
            <Route path="electricite" element={<ElectriciteChantiers />} />
            <Route path="electricite/chantiers/:chantierId" element={<ElectriciteSiteDetail />} />
            <Route path="electricite/plan-de-charge" element={<ElectricitePlanDeCharge />} />
            <Route path="electricite/import-sap" element={<ElectriciteImportSap />} />
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
