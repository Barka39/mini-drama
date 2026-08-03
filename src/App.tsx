import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { loadSeriesMeta } from "./lib/seriesAdmin";
import { Home } from "./pages/Home";
import { SeriesPage } from "./pages/SeriesPage";
import { PlayerFeed } from "./pages/PlayerFeed";
import { AdminPage } from "./pages/AdminPage";
import { HelpPage } from "./pages/HelpPage";
import { SearchPage } from "./pages/SearchPage";
import { MyMoviesPage } from "./pages/MyMoviesPage";
import { BottomNav } from "./components/BottomNav";
import { PurchaseModal } from "./components/PurchaseModal";
import { AuthModal } from "./components/AuthModal";
import { VipModal } from "./components/VipModal";

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
        <Route path="/help" element={<HelpPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/my" element={<MyMoviesPage />} />
      </Routes>
      <BottomNav />
      <PurchaseModal />
      <AuthModal />
      <VipModal />
    </HashRouter>
  );
}
