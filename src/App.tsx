import { HashRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { SeriesPage } from "./pages/SeriesPage";
import { PlayerFeed } from "./pages/PlayerFeed";
import { TopUpModal } from "./components/TopUpModal";

// HashRouter: GitHub Pages зэрэг статик хостинг дээр сервер тохиргоогүйгээр ажиллана
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/series/:seriesId" element={<SeriesPage />} />
        <Route path="/watch/:seriesId/:epIndex" element={<PlayerFeed />} />
      </Routes>
      <TopUpModal />
    </HashRouter>
  );
}
