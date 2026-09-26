import { BrowserRouter, Route, Routes } from "react-router-dom";
import Nav from "./components/Nav";
import DashboardPage from "./pages/DashboardPage";
import DeliveriesPage from "./pages/DeliveriesPage";
import EventsPage from "./pages/EventsPage";
import SubscribersPage from "./pages/SubscribersPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">&#8631;</span>
            WebhookForge
          </div>
          <span className="env-tag">
            {import.meta.env.DEV ? "local" : "production"}
          </span>
          <span className="system-status">
            <span className="dot" />
            Operational
          </span>
          <div className="header-spacer" />
          <button className="header-icon-btn" title="Notifications" disabled>
          &#128276;
          </button>
        </header>

        <Nav />

        <main className="app-body">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/subscribers" element={<SubscribersPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/deliveries" element={<DeliveriesPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}