import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import { clearSession } from "./auth/storage";

// Regra de segurança/uso: sempre exigir login ao entrar no app.
// Isso evita que alguém acesse rotas direto (ex.: /dashboard) usando sessão antiga no localStorage.
clearSession();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

