"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const SPEEDS = [
  { label: "Chill", secondsPerScreen: 5 },
  { label: "Normal", secondsPerScreen: 3.5 },
  { label: "Brisk", secondsPerScreen: 2 },
] as const;

/** Forced rendering resolutions (true CSS pixels inside the iframe). */
const VIEWPORTS = {
  desktop: { width: 1920, height: 1080, label: "🖥 Desktop" },
  mobile: { width: 390, height: 844, label: "📱 Mobile" },
} as const;

type Device = keyof typeof VIEWPORTS;

export default function Home() {
  const [url, setUrl] = useState("");
  const [speedIndex, setSpeedIndex] = useState(1);
  const [loop, setLoop] = useState(true);
  const [device, setDevice] = useState<Device>("desktop");
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const viewport = VIEWPORTS[device];

  /**
   * Each site is served under its own `*.ss.localhost` host, which the
   * middleware routes onto the internal /__ss proxy. The page therefore
   * keeps the real site's URL paths — every root-relative URL (framework
   * chunks, /_next/image, runtime-built URLs) resolves through the proxy
   * exactly as it would on the live site.
   */
  const iframeSrc = useMemo(() => {
    if (!sessionUrl) return "";
    try {
      const u = new URL(sessionUrl);
      const port = window.location.port ? `:${window.location.port}` : "";
      const src = `http://${u.hostname}.ss.localhost${port}${u.pathname}${u.search}`;
      return device === "mobile"
        ? `${src}${src.includes("?") ? "&" : "?"}__ssdevice=mobile`
        : src;
    } catch {
      return sessionUrl;
    }
  }, [sessionUrl, device]);

  // Scale the fixed-resolution box to fit the available stage area.
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    if (!sessionUrl) return;
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => {
      const s = Math.min(
        stage.clientWidth / viewport.width,
        stage.clientHeight / viewport.height,
      );
      setScale(s > 0 ? s : 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [sessionUrl, viewport.width, viewport.height]);

  const startSession = useCallback(() => {
    let target = url.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    setEnded(false);
    setPaused(false);
    setIframeReady(false);
    setSessionUrl(target);
  }, [url]);

  const endSession = useCallback(() => {
    setSessionUrl(null);
    setIframeReady(false);
    setEnded(false);
    setPaused(false);
  }, []);

  const restartWithDevice = useCallback((next: Device) => {
    setDevice(next);
    setEnded(false);
    setPaused(false);
    setIframeReady(false);
    setReloadKey((k) => k + 1);
  }, []);
  // The scroll driver lives inside the proxied page (injected by
  // rewriteHtmlHostMode) and runs the rAF loop there; we only push
  // configuration and receive lifecycle events over postMessage.
  const sendConfig = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        __ss: 1,
        type: "config",
        speed: SPEEDS[speedIndex].secondsPerScreen,
        loop,
        paused,
      },
      "*",
    );
  }, [speedIndex, loop, paused]);

  useEffect(() => {
    if (!sessionUrl) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { __ss?: number; type?: string } | null;
      if (!d || d.__ss !== 1) return;
      if (d.type === "ready") {
        setIframeReady(true);
        sendConfig();
      } else if (d.type === "ended") {
        setEnded(true);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sessionUrl, sendConfig]);
  if (sessionUrl) {
    return (
      <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
        {/* Toolbar — OUTSIDE the forced-resolution stage, never overlays
            the site and never appears in a fullscreen recording. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-2">
          <span className="max-w-[40%] truncate text-sm text-zinc-300">
            {ended ? "Reached the bottom of the page." : sessionUrl}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {!ended && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="rounded-full bg-white/10 px-4 py-1.5 text-sm transition-colors hover:bg-white/20"
              >
                {paused ? "▶ Resume" : "⏸ Pause"}
              </button>
            )}
            {!ended && (
              <button
                type="button"
                onClick={() => setSpeedIndex((i) => (i + 1) % SPEEDS.length)}
                className="rounded-full bg-white/10 px-4 py-1.5 text-sm transition-colors hover:bg-white/20"
              >
                {SPEEDS[speedIndex].label}
              </button>
            )}
            {!ended && (
              <button
                type="button"
                onClick={() =>
                  restartWithDevice(device === "desktop" ? "mobile" : "desktop")
                }
                className="rounded-full bg-white/10 px-4 py-1.5 text-sm transition-colors hover:bg-white/20"
              >
                {VIEWPORTS[device].label}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEnded(false);
                setPaused(false);
                setReloadKey((k) => k + 1);
              }}
              className="rounded-full bg-white/10 px-4 py-1.5 text-sm transition-colors hover:bg-white/20"
            >
              ↻ Restart
            </button>
            <button
              type="button"
              onClick={() =>
                void stageRef.current?.requestFullscreen?.().catch(() => {})
              }
              className="rounded-full bg-white/10 px-4 py-1.5 text-sm transition-colors hover:bg-white/20"
            >
              ⛶ Fullscreen
            </button>
            <button
              type="button"
              onClick={endSession}
              className="rounded-full bg-white/10 px-4 py-1.5 text-sm transition-colors hover:bg-white/20"
            >
              ✕ End
            </button>
          </div>
        </div>

        {/* Stage: the site renders at true 1920×1080 (or 390×844 mobile)
            CSS pixels, scaled to fit. Nothing overlays it. */}
        <div
          ref={stageRef}
          className="relative flex flex-1 items-center justify-center overflow-hidden bg-black"
        >
          <div
            ref={boxRef}
            style={{
              width: viewport.width,
              height: viewport.height,
              transform: `scale(${scale || 1})`,
              visibility: scale ? "visible" : "hidden",
            }}
            className="shrink-0 origin-center bg-white shadow-[0_0_60px_rgba(0,0,0,0.8)]"
          >
            <iframe
              key={reloadKey}
              ref={iframeRef}
              src={iframeSrc}
              title="Live website preview"
              onLoad={() => setIframeReady(true)}
              className="h-full w-full border-0"
              allow="clipboard-write"
            />
          </div>

          {!iframeReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
              <div className="flex flex-col items-center gap-4 text-zinc-400">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                <span className="text-sm">
                  Loading at {viewport.width}×{viewport.height}…
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <main className="w-full max-w-xl">
        <h1 className="text-4xl font-semibold tracking-tight">
          Site<span className="text-emerald-400">Showcase</span>
        </h1>
        <p className="mt-2 text-zinc-400">
          Enter a URL — the real site loads in a forced{" "}
          <strong className="text-zinc-200">1920×1080</strong> (desktop) or{" "}
          <strong className="text-zinc-200">390×844</strong> (mobile) viewport
          and auto-scrolls smoothly from top to bottom. Hover, animations and
          transitions all stay live — hit your screen recorder on the stage
          only, controls live outside it.
        </p>

        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) startSession();
          }}
        >
          <input
            type="text"
            inputMode="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 text-base outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
                {(Object.keys(VIEWPORTS) as Device[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      device === d
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {VIEWPORTS[d].label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
                {SPEEDS.map((speed, i) => (
                  <button
                    key={speed.label}
                    type="button"
                    onClick={() => setSpeedIndex(i)}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      speedIndex === i
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {speed.label}
                  </button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(e) => setLoop(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
                Loop
              </label>
            </div>

            <button
              type="submit"
              disabled={!url.trim()}
              className="h-10 rounded-lg bg-emerald-500 px-5 font-medium text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Go live
            </button>
          </div>
        </form>

        <p className="mt-8 text-sm text-zinc-500">
          Also here:{" "}
          <Link href="/brandboard" className="text-emerald-400 hover:underline">
            Brandboard — build a one-page brand board
          </Link>
        </p>
      </main>
    </div>
  );
}
