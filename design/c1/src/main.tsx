import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import d1 from "./directions/d1";
import d2 from "./directions/d2";
import d3 from "./directions/d3";
import type { Direction } from "./shared/direction";
import { Frame } from "./shared/Frame";
import { FRAME, SCREENS, type Device, type ScreenId } from "./shared/screens";
import "./gallery.css";

const DIRECTIONS: Direction[] = [d1, d2, d3];
const byId = (id: string) => DIRECTIONS.find((d) => d.id === id);

/**
 * Routes (hash, so the built files work from any folder):
 *   #/                          compare the three directions
 *   #/d1                        every screen of one direction, small
 *   #/compare/<screen>          one screen in all three directions
 *   #/d1/<screen>/<device>      ONE artboard at its exact size, nothing else (for Figma import)
 */
function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}

function App() {
  const route = useRoute();
  const [first, second, third] = route;
  const direction = first ? byId(first) : undefined;
  if (direction && second && third) return <Artboard direction={direction} screen={second as ScreenId} device={third as Device} />;
  if (direction) return <DirectionPage direction={direction} />;
  if (first === "compare" && second) return <ComparePage screen={second as ScreenId} />;
  return <Home />;
}

function Artboard({ direction, screen, device }: { direction: Direction; screen: ScreenId; device: Device }) {
  useEffect(() => {
    document.body.classList.add("artboard-only");
    document.title = `${direction.name} — ${SCREENS.find((s) => s.id === screen)?.title} (${FRAME[device].label})`;
    return () => document.body.classList.remove("artboard-only");
  }, [direction, screen, device]);
  return <Frame device={device}>{direction.render(screen, device)}</Frame>;
}

function Swatches({ direction }: { direction: Direction }) {
  return (
    <div className="swatches">
      {direction.swatches.map((s) => (
        <span key={s.name} title={`${s.name} ${s.value}`}>
          <i style={{ background: s.value }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function Home() {
  return (
    <main className="gallery">
      <header>
        <p className="eyebrow">POKER FRIENDS · C1 · 3 HƯỚNG THIẾT KẾ</p>
        <h1>Chọn một hướng</h1>
        <p className="lead">
          Ba hướng vẽ cùng {SCREENS.length} màn với cùng dữ liệu, mỗi màn có bản desktop 1440×900 và điện thoại dọc
          390×844. Bấm vào một hướng để xem hết các màn; "So từng màn" để đặt ba hướng cạnh nhau. Mỗi khung có link
          riêng đúng kích thước để đưa vào Figma (xem docs/c1-thiet-ke.md).
        </p>
      </header>
      <section className="directions">
        {DIRECTIONS.map((d) => (
          <article key={d.id} className="direction-card">
            <a href={`#/${d.id}`} className="preview">
              <Frame device="desktop" scale={0.27}>
                {d.render("table-turn", "desktop")}
              </Frame>
              <Frame device="mobile" scale={0.27}>
                {d.render("table-turn", "mobile")}
              </Frame>
            </a>
            <h2>
              <a href={`#/${d.id}`}>{d.name}</a>
            </h2>
            <p className="tagline">{d.tagline}</p>
            <p>{d.description}</p>
            <Swatches direction={d} />
            <p className="fonts">Chữ: {d.fonts.join(", ")}</p>
          </article>
        ))}
      </section>
      <section>
        <h2>So từng màn</h2>
        <ul className="screen-links">
          {SCREENS.map((s) => (
            <li key={s.id}>
              <a href={`#/compare/${s.id}`}>
                <b>{s.title}</b> <span>{s.group}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function DirectionPage({ direction }: { direction: Direction }) {
  return (
    <main className="gallery">
      <header>
        <p className="eyebrow">
          <a href="#/">← Ba hướng</a>
        </p>
        <h1>{direction.name}</h1>
        <p className="lead">{direction.description}</p>
        <Swatches direction={direction} />
      </header>
      {SCREENS.map((s) => (
        <section key={s.id} className="screen-row">
          <h2>
            {s.title} <span>{s.group}</span>
          </h2>
          <p className="brief">{s.brief}</p>
          <div className="frames">
            {(["desktop", "mobile"] as Device[]).map((device) => (
              <a key={device} href={`#/${direction.id}/${s.id}/${device}`} title="Mở khung đúng kích thước">
                <Frame device={device} scale={device === "desktop" ? 0.5 : 0.62}>
                  {direction.render(s.id, device)}
                </Frame>
                <small>{FRAME[device].label} ↗</small>
              </a>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function ComparePage({ screen }: { screen: ScreenId }) {
  const spec = SCREENS.find((s) => s.id === screen);
  return (
    <main className="gallery">
      <header>
        <p className="eyebrow">
          <a href="#/">← Ba hướng</a>
        </p>
        <h1>{spec?.title}</h1>
        <p className="lead">{spec?.brief}</p>
      </header>
      {(["desktop", "mobile"] as Device[]).map((device) => (
        <section key={device}>
          <h2>{FRAME[device].label}</h2>
          <div className="compare">
            {DIRECTIONS.map((d) => (
              <a key={d.id} href={`#/${d.id}/${screen}/${device}`}>
                <Frame device={device} scale={device === "desktop" ? 0.31 : 0.5}>
                  {d.render(screen, device)}
                </Frame>
                <small>{d.name} ↗</small>
              </a>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
