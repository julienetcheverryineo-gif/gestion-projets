import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Sites from "./pages/Sites";
import SiteDetail from "./pages/SiteDetail";
import Tasks from "./pages/Tasks";
import PlanningConsolide from "./pages/PlanningConsolide";
import PlanningDetaille from "./pages/PlanningDetaille";
import ChargeService from "./pages/ChargeService";
import ReservesGlobal from "./pages/ReservesGlobal";
import Users from "./pages/Users";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/connexion" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="chantiers" element={<Sites />} />
            <Route path="chantiers/:chantierId" element={<SiteDetail />} />
            <Route path="taches" element={<Tasks />} />
            <Route path="planning-consolide" element={<PlanningConsolide />} />
            <Route path="planning-detaille" element={<PlanningDetaille />} />
            <Route path="charge-service" element={<ChargeService />} />
            <Route path="reserves" element={<ReservesGlobal />} />
            <Route
              path="utilisateurs"
              element={
                <ProtectedRoute requireAdmin>
                  <Users />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
