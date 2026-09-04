import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Login } from "./pantallas/Login";
import { Chat } from "./pantallas/Chat";
import { BuscarLanzador } from "./pantallas/BuscarLanzador";

const PESTANAS = [
  { id: "chat", titulo: "Análisis", icono: "💬" },
  { id: "buscar", titulo: "Lanzador", icono: "🔍" },
] as const;

type PestanaId = (typeof PESTANAS)[number]["id"];

/**
 * Una pantalla que se esconde en vez de desmontarse.
 *
 * Lo obvio sería `{pestana === "chat" && <Chat />}`, y ahí está el bug de
 * "cambio de pestaña y se borra todo": React desmonta el componente y con él
 * se van el useState y lo que estabas escribiendo. Volver no lo recupera
 * porque no quedó nada que recuperar.
 *
 * Con `display: none` la pantalla sigue montada y conserva su estado, pero no
 * ocupa lugar ni se dibuja. `visitada` es para no montarlas todas de entrada:
 * cada una carga sus datos al montarse.
 */
function Pestana({
  activa,
  visitada,
  children,
}: {
  activa: boolean;
  visitada: boolean;
  children: React.ReactNode;
}) {
  if (!visitada) return null;
  return (
    <div style={{ display: activa ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {children}
    </div>
  );
}

export default function App() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<PestanaId>("chat");
  const [visitadas, setVisitadas] = useState<Set<PestanaId>>(() => new Set<PestanaId>(["chat"]));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  function irA(id: PestanaId) {
    setPestana(id);
    setVisitadas((previas) => (previas.has(id) ? previas : new Set(previas).add(id)));
  }

  if (cargando) {
    return (
      <div className="app" style={{ alignItems: "center", justifyContent: "center" }}>
        <span className="cargando" />
      </div>
    );
  }

  if (!sesion) return <div className="app"><Login /></div>;

  return (
    <div className="app">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Pestana activa={pestana === "chat"} visitada={visitadas.has("chat")}>
          <Chat />
        </Pestana>
        <Pestana activa={pestana === "buscar"} visitada={visitadas.has("buscar")}>
          <BuscarLanzador />
        </Pestana>
      </div>

      <nav className="barra">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => irA(p.id)}
            aria-current={pestana === p.id ? "page" : undefined}
          >
            <span className="icono">{p.icono}</span>
            {p.titulo}
          </button>
        ))}
        <button onClick={() => void supabase.auth.signOut()} aria-label="Cerrar sesión">
          <span className="icono">↩</span>
          Salir
        </button>
      </nav>
    </div>
  );
}
