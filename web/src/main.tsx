import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { BoardPage } from "./routes/BoardPage";
import { PlayerPage } from "./routes/PlayerPage";
import { MethodologyPage } from "./routes/MethodologyPage";
import "./fonts";
import "./styles/tokens.css";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<App />}>
          <Route index element={<BoardPage />} />
          <Route path="player/:id" element={<PlayerPage />} />
          <Route path="methodology" element={<MethodologyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
