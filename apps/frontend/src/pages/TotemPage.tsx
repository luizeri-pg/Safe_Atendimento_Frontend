import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/client";
import LegacyBackground from "../components/LegacyBackground";
import { senhaCurta } from "../utils/senha";

type CheckinResponse = {
  ok: boolean;
  found: boolean;
  senha: string;
  senhaDisplay?: string;
  cpf: string;
  nome: string | null;
  status: string;
};

export default function TotemPage() {
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  function resetAfter(ms: number) {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setCpf("");
      setResult(null);
      setError(null);
    }, ms);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const cpfTrim = cpf.trim();
    if (!cpfTrim) {
      setError("Digite um CPF válido.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<CheckinResponse>("/checkin", {
        method: "POST",
        body: JSON.stringify({ cpf: cpfTrim })
      });
      setResult(data);
      resetAfter(15000);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen min-w-screen h-screen w-screen flex items-center justify-center font-sans p-6 relative">
      <LegacyBackground variant="totem" />

      <div className="rounded-[32px] p-12 md:p-20 bg-white/25 shadow-2xl backdrop-blur-xl border border-white/25 flex flex-col items-center max-w-4xl w-full transition-shadow duration-300 hover:shadow-3xl">
        <div className="text-7xl font-extrabold text-white pb-8 md:pb-12">
          <img src="/assets/images/Vector.svg" alt="Safe Totem" className="max-w-4xl w-full h-auto" />
        </div>
        <div className="text-gray-900 text-4xl font-bold mb-9 text-center tracking-wide">Bem-vindo ao Autoatendimento</div>
        <div className="text-gray-700 text-xl mb-6 text-center">Digite seu CPF para gerar a senha.</div>

        <form className="mt-8 flex gap-3" onSubmit={onSubmit}>
          <input
            className="w-[90%] mx-auto block py-6 px-12 rounded-xl border-none text-2xl mb-2 outline-auto bg-white/70 shadow-md transition-all duration-200 focus:shadow-lg focus:bg-white focus:shadow-blue-500/15 placeholder:text-gray-400"
            placeholder="CPF"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            maxLength={14}
          />
          <button
            className="bg-gradient-to-r from-blue-500 to-secondary-500 text-white border-none rounded-xl py-6 px-14 text-2xl font-bold cursor-pointer mt-0 shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 mx-auto block disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>

        {error ? <div className="text-red-500 mt-5 text-2xl text-center bg-white/70 rounded-lg py-2 w-full">{error}</div> : null}

        {result ? (
          <div className="mt-6 w-full flex flex-col items-center">
            <div className="text-gray-900 text-4xl font-bold mb-6 text-center tracking-wide">Sua senha de atendimento</div>
            <div className="bg-white text-blue-500 text-6xl font-black rounded-[20px] py-9 px-18 my-4 shadow-lg tracking-wider">
              {result.senhaDisplay || senhaCurta(result.senha) || result.senha}
            </div>
            <div className="text-gray-800 text-2xl mb-2 text-center bg-white/50 rounded-xl py-4 w-full">
              {result.found
                ? "Por favor, aguarde ser chamado no painel. Obrigado!"
                : "Por favor, dirija-se ao atendente para completar seu cadastro."}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

