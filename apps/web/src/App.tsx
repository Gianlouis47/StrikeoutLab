import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Login } from "./pantallas/Login";
import { Chat } from "./pantallas/Chat";
import { BuscarLanzador } from "./pantallas/BuscarLanzador";
import { Historial } from "./pantallas/Historial";

// Las cinco de "Más" se bajan recién cuando se entra a una. Son la mitad del
// peso de la app (traen el paquete de cálculo y las tablas) y se usan una vez
// cada tanto: hacerlas esperar al abrir la app le cobra a todos los días el
// costo de lo que se hace una vez por semana. Con `display: none` la pantalla
// queda montada después, así que el chunk se baja una sola vez.
const Calibracion = lazy(() => import("./pantallas/Calibracion").then((m) => ({ default: m.Calibracion })));
const Parlay = lazy(() => import("./pantallas/Parlay").then((m) => ({ default: m.Parlay })));
const Rivales = lazy(() => import("./pantallas/Rivales").then((m) => ({ default: m.Rivales })));
const NuevaPick = lazy(() => import("./pantallas/NuevaPick").then((m) => ({ default: m.NuevaPick })));
const RegistrarSalida = lazy(() =>
  import("./pantallas/RegistrarSalida").then((m) => ({ default: m.RegistrarSalida })),
);

function Cargando() {
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
      <span className="cargando" />
    </div>
  );
}

// Abajo van las tres que se usan todos los días: mandar la foto, mirar un
// lanzador, anotar cómo salió. Las demás son para revisar o corregir a mano y
// viven en "Más" — una barra de nueve íconos no es una barra, es un menú mal
// puesto, y en un celular de 390 px cada botón terminaría de 43 px.
const PRINCIPALES = [
  { id: "chat", titulo: "Análisis", icono: "💬" },
  { id: "buscar", titulo: "Lanzador", icono: "🔍" },
  { id: "historial", titulo: "Historial", icono: "🕑" },
  { id: "mas", titulo: "Más", icono: "···" },
] as const;

const SECUNDARIAS = [
  { id: "calibracion", titulo: "Calibración", icono: "📊", detalle: "Si tus confianzas se sostienen" },
  { id: "parlay", titulo: "Parlay", icono: "🧩", detalle: "Cuántas patas conviene combinar" },
  { id: "rivales", titulo: "Rivales", icono: "👥", detalle: "Qué equipos se ponchan más" },
  { id: "nuevaPick", titulo: "Pick manual", icono: "➕", detalle: "Cargar una apuesta a mano" },
  { id: "salida", titulo: "Salida manual", icono: "⚾", detalle: "Anotar el resultado de un juego" },
] as const;

type PestanaId = (typeof PRINCIPALES)[number]["id"] | (typeof SECUNDARIAS)[number]["id"];

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
 * cada una carga sus datos al montarse, y montar las nueve al abrir la app
 * serían nueve consultas para ver una.
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

  if (!sesion) {
    return (
      <div className="app">
        <Login />
      </div>
    );
  }

  // "Más" queda marcado mientras se está en cualquiera de las que cuelgan de
  // él: si no, estando en Parlay la barra no marcaría nada y no habría forma
  // de saber por dónde se volvía.
  const enSecundaria = SECUNDARIAS.some((s) => s.id === pestana);

  return (
    <div className="app">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Pestana activa={pestana === "chat"} visitada={visitadas.has("chat")}>
          <Chat />
        </Pestana>
        <Pestana activa={pestana === "buscar"} visitada={visitadas.has("buscar")}>
          <BuscarLanzador />
        </Pestana>
        <Pestana activa={pestana === "historial"} visitada={visitadas.has("historial")}>
          <Historial />
        </Pestana>
        <Suspense fallback={<Cargando />}>
          <Pestana activa={pestana === "calibracion"} visitada={visitadas.has("calibracion")}>
            <Calibracion />
          </Pestana>
          <Pestana activa={pestana === "parlay"} visitada={visitadas.has("parlay")}>
            <Parlay />
          </Pestana>
          <Pestana activa={pestana === "rivales"} visitada={visitadas.has("rivales")}>
            <Rivales />
          </Pestana>
          <Pestana activa={pestana === "nuevaPick"} visitada={visitadas.has("nuevaPick")}>
            <NuevaPick />
          </Pestana>
          <Pestana activa={pestana === "salida"} visitada={visitadas.has("salida")}>
            <RegistrarSalida />
          </Pestana>
        </Suspense>

        {/* El menú "Más" no guarda estado, así que no necesita quedar montado. */}
        {pestana === "mas" && (
          <div className="contenido">
            <div>
              <h1 className="titulo">Más</h1>
              <p className="subtitulo">Lo que se usa de vez en cuando: revisar, corregir, calibrar.</p>
            </div>

            {SECUNDARIAS.map((s) => (
              <button
                key={s.id}
                className="tarjeta"
                onClick={() => irA(s.id)}
                style={{ cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}
              >
                <span className="fila">
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 20 }} aria-hidden="true">
                      {s.icono}
                    </span>
                    <span>
                      <strong style={{ fontSize: 15 }}>{s.titulo}</strong>
                      <br />
                      <span className="suave">{s.detalle}</span>
                    </span>
                  </span>
                  <span className="suave">›</span>
                </span>
              </button>
            ))}

            <button className="boton secundario" onClick={() => void supabase.auth.signOut()}>
              Cerrar sesión
            </button>

            <p className="suave" style={{ textAlign: "center", margin: 0 }}>
              Sesión de {sesion.user.email}
            </p>
          </div>
        )}
      </div>

      <nav className="barra">
        {PRINCIPALES.map((p) => {
          const activa = pestana === p.id || (p.id === "mas" && enSecundaria);
          return (
            <button key={p.id} onClick={() => irA(p.id)} aria-current={activa ? "page" : undefined}>
              {/* aria-hidden en el ícono: si no, el nombre accesible del botón
                  queda "💬Análisis" y un lector de pantalla lee "globo de
                  diálogo Análisis". El ícono es decoración, el texto de al
                  lado ya dice todo. */}
              <span className="icono" aria-hidden="true">
                {p.icono}
              </span>
              {p.titulo}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
