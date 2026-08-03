import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { loadSeriesMeta } from "./lib/seriesAdmin";
import { Home } from "./pages/Home";
import { SeriesPage } from "./pages/SeriesPage";
import { PlayerFeed } from "./pages/PlayerFeed";
import { AdminPage } from "./pages/AdminPage";
import { PurchaseModal } from "./components/PurchaseModal";
import { AuthModal } from "./components/AuthModal";

// HashRouter: GitHub Pages зэрэг статик хостинг дээр сервер тохиргоогүйгээр ажиллана
export default function App() {
  // Админы засварыг (нэр, ангилал, үнэ, эрэмбэ) ачаална
  useEffect(() => {
    void loadSeriesMeta();
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/series/:seriesId" element={<SeriesPage />} />
        <Route path="/watch/:seriesId/:epIndex" element={<PlayerFeed />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
      <PurchaseModal />
      <AuthModal />
    </HashRouter>
  );
}
