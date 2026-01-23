import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import { clearLegacyPersistentSession } from "./auth/storage";

// Segurança: não manter login persistente no navegador.
// A sessão fica apenas nesta aba (sessionStorage).
clearLegacyPersistentSession();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

