import { useEffect } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { PATH_MODE } from "./lib/routing";
import { loadSeriesMeta } from "./lib/seriesAdmin";
import { Home } from "./pages/Home";
import { SeriesPage } from "./pages/SeriesPage";
import { MoviePlayer } from "./pages/MoviePlayer";
import { PlayerFeed } from "./pages/PlayerFeed";
import { AdminPage } from "./pages/AdminPage";
import { HelpPage } from "./pages/HelpPage";
import { SearchPage } from "./pages/SearchPage";
import { MyMoviesPage } from "./pages/MyMoviesPage";
import { ClaimPage } from "./pages/ClaimPage";
import { BottomNav } from "./components/BottomNav";
import { PurchaseModal } from "./components/PurchaseModal";
import { AuthModal } from "./components/AuthModal";
import { VipModal } from "./components/VipModal";
import { InstallPrompt } from "./components/InstallPrompt";

// Үндсэн домэйнд #-гүй хаяг (BrowserRouter), GitHub-ийн нөөц хаягт HashRouter
const Router = PATH_MODE ? BrowserRouter : HashRouter;

export default function App() {
  // Админы засварыг (нэр, ангилал, үнэ, эрэмбэ) ачаална
  useEffect(() => {
    void loadSeriesMeta();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/series/:seriesId" element={<SeriesPage />} />
        <Route path="/watch/:seriesId/:epIndex" element={<PlayerFeed />} />
        <Route path="/movie/:seriesId" element={<MoviePlayer />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/my" element={<MyMoviesPage />} />
        <Route path="/u/:token" element={<ClaimPage />} />
        {/* Буруу/хуучирсан хаяг — хоосон дэлгэц биш, нүүр хуудас */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <InstallPrompt />
      <BottomNav />
      <PurchaseModal />
      <AuthModal />
      <VipModal />
    </Router>
  );
}
