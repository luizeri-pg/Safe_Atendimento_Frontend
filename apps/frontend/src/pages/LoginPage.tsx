import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { setSession, setStoredUser } from "../auth/storage";

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number | null;
  profile: { id: string; username: string; nome: string; role: string };
};

export default function LoginPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      setSession({ accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in });
      setStoredUser({
        id: data.profile.id,
        username: data.profile.username,
        nome: data.profile.nome,
        role: String(data.profile.role || "").trim().toLowerCase()
      });
      nav("/dashboard", { replace: true });
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="font-sans bg-gradient-to-br from-blue-500 to-blue-700 min-h-screen flex items-center justify-center relative overflow-hidden p-6">
      <div className="bg-animated opacity-10 fixed top-0 left-0 w-full h-full" />
      <div className="fixed w-full h-full overflow-hidden z-[1]">
        <div className="floating-shape absolute bg-white/10 rounded-full w-20 h-20 left-[10%]" style={{ animationDelay: "0s" }} />
        <div className="floating-shape absolute bg-white/10 rounded-full w-[120px] h-[120px] left-[20%]" style={{ animationDelay: "2s" }} />
        <div className="floating-shape absolute bg-white/10 rounded-full w-[60px] h-[60px] left-[70%]" style={{ animationDelay: "4s" }} />
        <div className="floating-shape absolute bg-white/10 rounded-full w-[100px] h-[100px] left-[80%]" style={{ animationDelay: "6s" }} />
      </div>

      <div className="legacy-panel rounded-3xl p-12 shadow-2xl w-full max-w-[420px] relative z-10 border border-white/20">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-[20px] inline-flex items-center justify-center mb-5 shadow-lg">
            <i className="fas fa-user-md text-3xl text-white" />
          </div>
          <div className="text-3xl font-extrabold text-gray-800 mb-2">Safe Atendimento</div>
          <div className="text-base text-gray-600 font-medium">Sistema de Gestão Médica</div>
        </div>

        {error ? <div className="bg-red-100 text-red-800 py-3 px-4 rounded-lg mb-5 text-sm">{error}</div> : null}

        <form onSubmit={onSubmit}>
          <div className="mb-6 relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="username">
              Usuário
            </label>
            <div className="relative">
              <input
                id="username"
                className="w-full py-4 px-5 border-2 border-gray-200 rounded-xl text-base transition-all duration-300 bg-white/80 focus:outline-none focus:border-blue-500 focus:shadow-lg focus:shadow-blue-500/10 focus:bg-white placeholder:text-gray-400 pr-12"
                placeholder="seu.usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
              <i className="fas fa-user absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
            </div>
          </div>

          <div className="mb-6 relative">
            <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="password">
              Senha
            </label>
            <div className="relative">
              <input
                id="password"
                type="password"
                className="w-full py-4 px-5 border-2 border-gray-200 rounded-xl text-base transition-all duration-300 bg-white/80 focus:outline-none focus:border-blue-500 focus:shadow-lg focus:shadow-blue-500/10 focus:bg-white placeholder:text-gray-400 pr-12"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <i className="fas fa-lock absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-700 text-white border-none rounded-xl text-base font-semibold cursor-pointer transition-all duration-300 relative overflow-hidden hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
          >
            <span className={loading ? "opacity-0" : ""}>Entrar</span>
            {loading ? (
              <div className="button-loading absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 border-2 border-transparent border-t-white rounded-full" />
            ) : null}
          </button>
        </form>

        <div className="text-center mt-6">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              alert("Funcionalidade em desenvolvimento. Entre em contato com o administrador do sistema.");
            }}
            className="text-blue-500 no-underline text-sm font-medium hover:underline"
          >
            Esqueceu sua senha?
          </a>
        </div>

        <div className="bg-blue-50/50 border border-blue-200/20 rounded-xl p-4 mt-6 text-center">
          <h4 className="text-gray-700 text-sm font-semibold mb-2">Credenciais (Supabase)</h4>
          <p className="text-gray-600 text-xs my-1">
            <strong>Usuário:</strong> seu <em>username</em> (ex: medico1)
          </p>
          <p className="text-gray-600 text-xs my-1">
            <strong>Senha:</strong> sua senha do Supabase Auth
          </p>
          <p className="text-gray-600 text-[11px] mt-2 leading-snug">
            Observação: o login usa e-mail sintético <code>username@safe.local</code>. O Painel Público roda dentro do mesmo
            perfil logado (sem troca de perfil).
          </p>
        </div>
      </div>
    </div>
  );
}

