"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameWorld, type GameWorldInteraction } from "@rarefriends/friendsdk/world-view";
import { getWorldPreset, validateWorld } from "@rarefriends/friendsdk/world";
import { createFriendReader, spriteFrame, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { createFriendSoundKit, type FriendSoundKit, type FriendSoundCue } from "@rarefriends/friendsdk/sounds";
import "@rarefriends/friendsdk/frame.css";
import "@rarefriends/friendsdk/world-view.css";
import "./style.css";

type Stats = Readonly<{ energy: number; safety: number; suspicion: number }>;
type EventChoice = Readonly<{
  id: string; label: string; effect: Partial<Stats>; reaction: string; cue: FriendSoundCue;
}>;
type NightEvent = Readonly<{
  id: number; target: string; station: string; title: string; description: string;
  choices: readonly [EventChoice, EventChoice];
}>;
type GameStage = "title" | "playing" | "won" | "lost";

const START: Stats = Object.freeze({ energy: 100, safety: 100, suspicion: 0 });
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const applyChoice = (stats: Stats, choice: EventChoice): Stats => ({
  energy: clamp(stats.energy + (choice.effect.energy ?? 0)),
  safety: clamp(stats.safety + (choice.effect.safety ?? 0)),
  suspicion: clamp(stats.suspicion + (choice.effect.suspicion ?? 0)),
});
const failure = (stats: Stats) => stats.energy <= 0 ? "energy" : stats.safety <= 0 ? "safety" : stats.suspicion >= 100 ? "suspicion" : null;

const EVENTS: readonly NightEvent[] = [
  { id: 1, target: "door", station: "MAIN DOOR", title: "Three slow knocks", description: "Three slow knocks come from the main entrance. They stop just as you reach the door.", choices: [
    { id: "stay-away", label: "Stay away from the door", effect: { energy: -8, safety: 7, suspicion: -3 }, reaction: "Your Friend keeps a safe distance. The knocking fades into the rain.", cue: "select" },
    { id: "ask-who", label: "Ask who is there", effect: { energy: -2, safety: -22, suspicion: 8 }, reaction: "Your Friend calls out. The knocks answer from somewhere inside.", cue: "impact" },
  ] },
  { id: 2, target: "desk", station: "NIGHT DESK", title: "The lights go out", description: "The whole control room drops into darkness. The desk lamp is your only way to see.", choices: [
    { id: "lamp", label: "Switch on the desk lamp", effect: { energy: -14, safety: 10, suspicion: 2 }, reaction: "Your Friend brings the warm desk lamp back to life. That took more effort than it should have.", cue: "select" },
    { id: "still", label: "Wait in the dark", effect: { energy: 5, safety: -18, suspicion: 6 }, reaction: "Your Friend saves their strength. Something shifts closer in the dark.", cue: "impact" },
  ] },
  { id: 3, target: "monitor", station: "SECURITY MONITOR", title: "Movement on camera", description: "A camera feed flickers. A shape is moving near the loading bay.", choices: [
    { id: "review-feed", label: "Review the camera feed", effect: { energy: -15, safety: 8, suspicion: 2 }, reaction: "Your Friend scrubs the feed. The tarp is loose—but now the camera knows it's being watched.", cue: "select" },
    { id: "switch-feed", label: "Switch off the monitor", effect: { energy: 3, safety: -18, suspicion: 8 }, reaction: "The screen goes black. Your Friend gets a moment to breathe, but the room feels larger.", cue: "impact" },
  ] },
  { id: 4, target: "phone", station: "DESK PHONE", title: "The phone rings", description: "The red phone starts ringing. Nobody should be calling at this hour.", choices: [
    { id: "answer", label: "Answer the phone", effect: { energy: -16, safety: -5, suspicion: 15 }, reaction: "Your Friend answers. A whisper says your name, then the line dies.", cue: "impact" },
    { id: "let-ring", label: "Let it ring out", effect: { energy: 2, safety: 2, suspicion: -4 }, reaction: "The ringing stops by itself. Your Friend catches their breath in the quiet.", cue: "reward" },
  ] },
  { id: 5, target: "storage", station: "STORAGE", title: "A noise in storage", description: "Something scrapes across the storage room floor. The crate lid is ajar.", choices: [
    { id: "secure-storage", label: "Secure the storage door", effect: { energy: -12, safety: 8, suspicion: 22 }, reaction: "Your Friend slams the bolt home. The clang echoes down the corridor; something heard it.", cue: "select" },
    { id: "look-inside", label: "Look inside", effect: { energy: -18, safety: -15, suspicion: 8 }, reaction: "Your Friend finds wet footprints leading out. One fresh print appears beside their own.", cue: "impact" },
  ] },
  { id: 6, target: "monitor", station: "SECURITY MONITOR", title: "A figure in the hallway", description: "The hallway camera shows a figure standing perfectly still, facing the lens.", choices: [
    { id: "sound-alarm", label: "Sound the alarm", effect: { energy: -15, safety: 8, suspicion: 25 }, reaction: "Your Friend triggers the alarm. The figure vanishes—but every camera turns toward the room.", cue: "select" },
    { id: "keep-watching", label: "Keep watching", effect: { energy: -5, safety: -12, suspicion: 10 }, reaction: "Your Friend watches as the figure slowly raises one hand. It is waving at them.", cue: "impact" },
  ] },
  { id: 7, target: "storage", station: "STORAGE", title: "The room answers back", description: "A second scrape comes from storage, followed by a soft knock from the inside.", choices: [
    { id: "call-security", label: "Call for backup", effect: { energy: -12, safety: 5, suspicion: 22 }, reaction: "Your Friend calls the night supervisor. A familiar voice answers from the wrong room.", cue: "reward" },
    { id: "check-alone", label: "Check the room alone", effect: { energy: -20, safety: -18, suspicion: 10 }, reaction: "Your Friend steps in. Every box is facing the wall now—and one is breathing.", cue: "impact" },
  ] },
  { id: 8, target: "desk", station: "NIGHT DESK", title: "First light", description: "The clock reaches 06:00. One final alert flashes across the desk before sunrise.", choices: [
    { id: "log-shift", label: "Log the final report", effect: { energy: -15, safety: 8, suspicion: 3 }, reaction: "Your Friend files the report as dawn spills across the room. The last camera clicks off.", cue: "reward" },
    { id: "ignore-alert", label: "Ignore the alert", effect: { energy: 2, safety: -8, suspicion: 15 }, reaction: "Your Friend lets the alert fade. Something knocks once from the other side of the screen.", cue: "reveal-common" },
  ] },
];

const FAILURE_COPY = Object.freeze({
  energy: { title: "You couldn't stay awake until morning.", detail: "Your Friend's focus slipped. The last thing they heard was the phone ringing." },
  safety: { title: "Something got inside before you could react.", detail: "The station is quiet again. Your Friend never made it back to the desk." },
  suspicion: { title: "They know you're here.", detail: "Every monitor turns toward your Friend. There is nowhere left to hide." },
});

const baseWorld = getWorldPreset("02-circuit-courtyard-complete");
const NIGHT_WORLD = validateWorld({
  ...baseWorld,
  id: "night-shift-control-room",
  name: "Night Shift Control Room",
  family: "rare-friends-night-shift",
  setting: "After-hours security station",
  shape: "Secured isometric facility",
  summary: "A quiet overnight security facility with a desk, camera station, entrance, phone and storage room.",
  geometry: { ...baseWorld.geometry, holes: [] },
  props: [
    { type: "terminal", x: 132, y: 112, scale: 1.25 },
    { type: "terminal", x: 432, y: 82, scale: 1.15 },
    { type: "antenna", x: 500, y: 190, scale: 1.1 },
    { type: "crate", x: 440, y: 302, scale: 1.15 },
    { type: "terminal", x: 158, y: 290, scale: 0.65 },
    { type: "bench", x: 190, y: 116, scale: 0.9 },
    { type: "tank", x: 505, y: 92, scale: 0.82 },
    { type: "vent", x: 375, y: 305, scale: 0.88 },
    { type: "pipe", x: 95, y: 190, scale: 0.86 },
    { type: "dish", x: 365, y: 92, scale: 0.72 },
    { type: "solar", x: 110, y: 285, scale: 0.62 },
    { type: "crate", x: 500, y: 295, scale: 0.72 },
  ],
  paths: [
    { points: [[455, 235], [410, 230], [360, 210], [300, 205], [245, 190], [190, 155], [132, 112]], width: 12 },
    { points: [[360, 210], [390, 170], [432, 82]], width: 10 },
    { points: [[410, 230], [448, 220], [475, 205]], width: 10 },
    { points: [[410, 230], [430, 262], [440, 302]], width: 10 },
    { points: [[300, 205], [240, 242], [200, 270], [158, 290]], width: 10 },
  ],
  patches: [
    { x: 216, y: 164, w: 126, h: 72, pattern: "grid" },
    { x: 382, y: 46, w: 120, h: 72, pattern: "hatch" },
    { x: 422, y: 266, w: 108, h: 72, pattern: "dense" },
    { x: 72, y: 258, w: 112, h: 70, pattern: "grid" },
  ],
  actors: [], signals: [], missingChunks: [], variant: "complete",
});
const SPAWN = [465, 235] as const;
const STATIONS: readonly GameWorldInteraction[] = [
  { id: "desk", label: "Night desk", position: [165, 140], reach: 62, labelOffset: -54 },
  { id: "monitor", label: "Security monitor", position: [410, 130], reach: 64, labelOffset: -58 },
  { id: "door", label: "Main door", position: [475, 205], reach: 64, labelOffset: -205 },
  { id: "storage", label: "Storage room", position: [405, 330], reach: 65, labelOffset: -50 },
  { id: "phone", label: "Desk phone", position: [190, 250], reach: 64, labelOffset: -54 },
];
const reader = createFriendReader();

function FriendPortrait({ friendId, reducedMotion = false, paused = false }: { friendId: bigint; reducedMotion?: boolean; paused?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setSprites(null); setError("");
    void reader.read(friendId).then(value => { if (current) setSprites(value); })
      .catch(() => { if (current) setError("Friend artwork is unavailable. Check your connection and retry the shift."); });
    return () => { current = false; };
  }, [friendId]);
  useEffect(() => {
    const target = canvas.current, context = target?.getContext("2d");
    if (!target || !context || !sprites) return;
    target.width = target.height = 16;
    context.imageSmoothingEnabled = false;
    const render = (index: number) => {
      const rows = spriteFrame(sprites, "down", false, index).frame.rows;
      context.clearRect(0, 0, 16, 16);
      context.fillStyle = "#fff";
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (rows[y][x] === "#") {
        for (let dy = Math.max(0, y - 1); dy <= Math.min(15, y + 1); dy++) {
          for (let dx = Math.max(0, x - 1); dx <= Math.min(15, x + 1); dx++) context.fillRect(dx, dy, 1, 1);
        }
      }
      context.fillStyle = "#111522";
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (rows[y][x] === "#") context.fillRect(x, y, 1, 1);
    };
    render(0);
    if (reducedMotion || paused) return;
    let frame = 0;
    const timer = window.setInterval(() => { frame = (frame + 1) % 8; render(frame); }, 220);
    return () => window.clearInterval(timer);
  }, [sprites, reducedMotion, paused]);
  if (error) return <div className="ns-friend-fallback" role="alert">{error}</div>;
  if (!sprites) return <div className="ns-friend-fallback" role="status">Loading Friend #{friendId.toString()}…</div>;
  return <canvas ref={canvas} className="ns-friend-portrait" role="img" aria-label={`Selected Rare Friend #${friendId.toString()}`} data-friend-id={friendId.toString()} />;
}

function StatBar({ label, value, color, delta }: { label: string; value: number; color: string; delta?: number }) {
  return <div className="ns-stat">
    <div className="ns-stat-label"><span>{label}</span><span className="ns-stat-reading">{delta !== undefined && delta !== 0 && <i className={`ns-stat-delta ${delta > 0 ? "positive" : "negative"}`} role="status">{label} {delta > 0 ? "+" : "−"}{Math.abs(delta)}</i>}<strong>{value}<small>%</small></strong></span></div>
    <div className="ns-stat-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span style={{ width: `${value}%`, background: color }} />
    </div>
  </div>;
}

function TouchPad({ disabled, onKey }: { disabled: boolean; onKey: (key: string, down: boolean) => void }) {
  const press = (key: string, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onKey(key, true);
  };
  const release = (key: string) => onKey(key, false);
  const tap = (key: string) => {
    onKey(key, true);
    window.setTimeout(() => onKey(key, false), 140);
  };
  const keys = [
    ["ArrowUp", "↑", "Move up"], ["ArrowLeft", "←", "Move left"],
    ["ArrowDown", "↓", "Move down"], ["ArrowRight", "→", "Move right"],
  ] as const;
  return <div className="ns-touch-pad" aria-label="Touch movement controls">
    {keys.map(([key, glyph, label]) => <button key={key} type="button" className={`ns-pad-${key.slice(5).toLowerCase()}`} aria-label={label} disabled={disabled}
      onPointerDown={event => press(key, event)} onPointerUp={() => release(key)} onPointerCancel={() => release(key)} onLostPointerCapture={() => release(key)} onPointerLeave={() => release(key)} onClick={() => tap(key)}>{glyph}</button>)}
  </div>;
}

export default function NightShiftGame({ friendId, client, paused }: GameComponentProps) {
  const [stats, setStats] = useState<Stats>(START);
  const [eventIndex, setEventIndex] = useState(0);
  const [eventOpen, setEventOpen] = useState(false);
  const [stage, setStage] = useState<GameStage>("title");
  const [reaction, setReaction] = useState("");
  const [lastChange, setLastChange] = useState<Stats | null>(null);
  const [chosenChoice, setChosenChoice] = useState<string | null>(null);
  const [failedBy, setFailedBy] = useState<keyof typeof FAILURE_COPY | null>(null);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [identityError, setIdentityError] = useState("");
  const [shiftRevision, setShiftRevision] = useState(0);
  const map = useRef<HTMLDivElement>(null);
  const sound = useRef<FriendSoundKit | null>(null);
  const timer = useRef<number | null>(null);
  const currentEvent = EVENTS[eventIndex];
  const blocked = paused || settingsOpen || stage !== "playing";

  useEffect(() => {
    let current = true;
    setReady(false); setIdentityError("");
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update(); preference.addEventListener("change", update);
    sound.current = createFriendSoundKit({ muted: true });
    void client.read().then(snapshot => {
      if (!current) return;
      if (snapshot.friendId !== friendId) setIdentityError(`Selected Friend #${friendId.toString()} does not match this game session.`);
      setReady(true);
    }).catch(() => { if (current) setReady(true); });
    return () => {
      current = false; preference.removeEventListener("change", update);
      if (timer.current !== null) window.clearTimeout(timer.current);
      sound.current?.dispose(); sound.current = null;
    };
  }, [client, friendId]);

  const sendMovementKey = (key: string, down: boolean) => {
    const canvas = map.current?.querySelector("canvas");
    if (!canvas) return;
    if (down) canvas.focus();
    canvas.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key, bubbles: true, cancelable: true }));
  };

  const beginShift = () => {
    if (identityError) return;
    setShiftRevision(value => value + 1);
    setStats(START); setEventIndex(0); setEventOpen(false); setReaction(""); setLastChange(null); setChosenChoice(null); setFailedBy(null); setNotice(""); setBusy(false);
    setSettingsOpen(false); setStage("playing"); sound.current?.play("select");
    window.setTimeout(() => map.current?.querySelector("canvas")?.focus(), 0);
  };

  const restart = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null; beginShift();
  };

  const interact = (id: string) => {
    if (blocked || busy || eventOpen) return;
    if (id !== currentEvent.target) {
      const station = STATIONS.find(item => item.id === currentEvent.target)?.label ?? "the next station";
      setNotice(`Your Friend checks in, but the current alert is at the ${station.toLowerCase()}.`);
      sound.current?.play("select");
      return;
    }
    setNotice(""); setLastChange(null); setChosenChoice(null); setEventOpen(true); setReaction(`Your Friend reports to the ${currentEvent.station.toLowerCase()}.`);
    sound.current?.play("anticipation");
  };

  const choose = (choice: EventChoice) => {
    if (blocked || busy || stage !== "playing" || !eventOpen) return;
    setBusy(true);
    const updated = applyChoice(stats, choice);
    const changes: Stats = {
      energy: updated.energy - stats.energy,
      safety: updated.safety - stats.safety,
      suspicion: updated.suspicion - stats.suspicion,
    };
    const lost = failure(updated);
    setStats(updated); setReaction(choice.reaction); setNotice("");
    setLastChange(changes); setChosenChoice(choice.id);
    sound.current?.play(choice.cue);
    timer.current = window.setTimeout(() => {
      timer.current = null; setBusy(false); setEventOpen(false);
      if (lost) { setFailedBy(lost); setStage("lost"); return; }
      if (eventIndex === EVENTS.length - 1) { setStage("won"); return; }
      setEventIndex(value => value + 1);
    }, reducedMotion ? 160 : 850);
  };

  const toggleMute = () => {
    const next = !muted; setMuted(next); sound.current?.setMuted(next);
    if (!next) void sound.current?.unlock();
  };

  if (!ready) return <section className="night-shift-game" aria-live="polite"><div className="ns-loading"><span className="ns-eyebrow">RARE FRIENDS · NIGHT OPERATIONS</span><h1>Preparing your shift…</h1><p>Checking the session and loading the room.</p></div></section>;
  if (identityError) return <section className="night-shift-game"><div className="ns-loading" role="alert"><span className="ns-eyebrow">SESSION CHECK</span><h1>Friend mismatch</h1><p>{identityError}</p></div></section>;

  if (stage === "title") return <main className={`night-shift-game ns-title-screen ${reducedMotion ? "reduced-motion" : ""}`}>
    <div className="ns-title-copy"><div className="ns-brand"><span className="ns-brand-mark">RF</span><span>RARE FRIENDS <i>VIBEATHON</i></span></div>
      <span className="ns-eyebrow">NIGHT SECURITY SHIFT · 10:00 PM — 06:00 AM</span><h1>Night Shift</h1>
      <p className="ns-title-intro">Something is wrong with this building tonight.</p>
      <p className="ns-lede">Survive the shift. Make it to morning.</p>
      <div className="ns-title-meta"><span>8 INCIDENTS</span><span>ONE LONG NIGHT</span><span>NO SECOND CHANCES</span></div>
      <button className="ns-button ns-button-primary ns-start" type="button" onClick={beginShift}>Start shift <span aria-hidden="true">→</span></button>
      <p className="ns-title-help">Explore the station, respond to incidents, and keep your Friend safe until morning.</p>
    </div>
    <aside className="ns-title-friend"><div className="ns-orbit ns-orbit-one"/><div className="ns-orbit ns-orbit-two"/><span className="ns-friend-kicker">ON DUTY WITH</span>
      <FriendPortrait friendId={friendId} reducedMotion={reducedMotion} /><strong>Friend #{friendId.toString()}</strong><span className="ns-friend-caption">YOUR NIGHT-SHIFT PARTNER</span>
      <span className="ns-status-pill"><i/> IDENTITY VERIFIED</span>
    </aside>
    <span className="ns-title-coordinate">RH-06 · 02:14 AM</span>
  </main>;

  if (stage === "won" || stage === "lost") {
    const won = stage === "won";
    const cause = failedBy ? FAILURE_COPY[failedBy] : null;
    return <main className={`night-shift-game ns-result-screen ${won ? "is-win" : "is-loss"} ${reducedMotion ? "reduced-motion" : ""}`}>
      <div className="ns-result-art"><div className="ns-result-glow"/><FriendPortrait friendId={friendId} reducedMotion={reducedMotion} paused /></div>
      <span className="ns-eyebrow">{won ? "SHIFT COMPLETE" : "SHIFT FAILED"}</span>
      {won && <span className="ns-result-clock">06:00 AM</span>}
      <h1>{won ? "You made it through the night." : cause?.title ?? "The shift is over."}</h1>
      <p>{won ? "The first light fills the control room. Your Friend clocks out safe." : cause?.detail ?? "Your shift ends here."}</p>
      <div className="ns-result-friend">OFF DUTY WITH <strong>Friend #{friendId.toString()}</strong></div>
      <h2 className="ns-final-label">FINAL STATS</h2>
      <div className="ns-result-stats"><span>ENERGY <b>{stats.energy}</b></span><span>SAFETY <b>{stats.safety}</b></span><span>SUSPICION <b>{stats.suspicion}</b></span></div>
      <button className="ns-button ns-button-primary" type="button" onClick={restart}>{won ? "Work another shift" : "Try again"} <span aria-hidden="true">↻</span></button>
    </main>;
  }

  return <main className={`night-shift-game ns-game-screen ${reducedMotion ? "reduced-motion" : ""}`} aria-label="Rare Friend: Night Shift">
    <header className="ns-topbar"><div className="ns-brand"><span className="ns-brand-mark">RF</span><span>RARE FRIENDS <i>VIBEATHON</i></span></div>
      <div className="ns-header-center"><span className="ns-live-dot"/> NIGHT WATCH <b>·</b> 02:14 AM</div>
      <div className="ns-top-actions"><span className="ns-duty-chip">ON DUTY · #{friendId.toString()}</span>
        <button className="ns-icon-button ns-sound-button" type="button" onClick={toggleMute} aria-pressed={!muted} aria-label={muted ? "Enable sound" : "Mute sound"}>{muted ? "◖×" : "◖))"}</button>
        <button className="ns-icon-button" type="button" aria-label="Pause and settings" onClick={() => { setSettingsOpen(true); sound.current?.play("select"); }}>Ⅱ</button></div>
    </header>
    <section className="ns-game-layout">
      <div className="ns-map-column">
        <div className="ns-map-heading"><div><span className="ns-eyebrow">FACILITY 06 · SECURITY WING</span><h2>Control room</h2></div><span className="ns-camera-status"><i/> ALL SYSTEMS LIVE</span></div>
        <div className="ns-controls-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> MOVE</span><span><kbd>E</kbd> INTERACT</span><span className="ns-tap-hint">TAP FLOOR TO WALK</span></div>
        <div className="ns-map-stage" ref={map} tabIndex={0} role="application" aria-label="Night-shift room. Use WASD or arrow keys to move; E to interact." onKeyDownCapture={event => {
          if (event.target === map.current?.querySelector("canvas")) return;
          if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "e", "E"].includes(event.key)) {
            event.preventDefault(); sendMovementKey(event.key.toLowerCase() === "e" ? "e" : event.key, true);
          }
        }} onKeyUpCapture={event => {
          if (event.target === map.current?.querySelector("canvas")) return;
          if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "e", "E"].includes(event.key)) {
            event.preventDefault(); sendMovementKey(event.key.toLowerCase() === "e" ? "e" : event.key, false);
          }
        }}>
          <div className="ns-room-window" aria-hidden="true"><i/><b/><span/></div>
          <div className="ns-room-wall-lights" aria-hidden="true"><i/><i/><i/></div>
          <div className="ns-map-vignette" aria-hidden="true"/>
          <GameWorld key={shiftRevision} world={NIGHT_WORLD} spawn={SPAWN} interactions={STATIONS} friendId={friendId} friendPixelScale={7} paused={blocked || busy || eventOpen} reducedMotion={reducedMotion} color onInteract={interact}/>
          <div className="ns-location-legend" aria-label="Room stations"><span>01 · DESK</span><span>02 · CAMERAS</span><span>03 · ENTRY</span><span>04 · PHONE</span><span>05 · STORAGE</span></div>
          <TouchPad disabled={blocked || busy} onKey={sendMovementKey}/>
          {paused && <div className="ns-host-paused" role="status">GAME PAUSED BY HOST</div>}
        </div>
      </div>
      <aside className="ns-console">
        <section className="ns-status-card"><div className="ns-card-heading"><span>SHIFT CONDITION</span><span className="ns-stat-time">02:14 <small>AM</small></span></div>
          <StatBar label="ENERGY" value={stats.energy} delta={lastChange?.energy} color="linear-gradient(90deg,#5ee1b3,#c2ffd9)"/>
          <StatBar label="SAFETY" value={stats.safety} delta={lastChange?.safety} color="linear-gradient(90deg,#55bdf4,#b4e8ff)"/>
          <StatBar label="SUSPICION" value={stats.suspicion} delta={lastChange?.suspicion} color="linear-gradient(90deg,#f1b650,#ff6f7d)"/>
        </section>
        <section className={`ns-event-card ${eventOpen ? "is-active" : ""} ${busy ? "is-resolving" : ""}`} aria-live="polite">
          <div className="ns-event-kicker"><span>INCIDENT {String(currentEvent.id).padStart(2, "0")} <i>/ 08</i></span><span className="ns-priority"><i/> {eventOpen ? "RESPOND" : "DISPATCHED"}</span></div>
          <div className="ns-progress-dots" aria-label={`Incident ${currentEvent.id} of 8`}>{EVENTS.map((event, index) => <i key={event.id} className={index < eventIndex ? "complete" : index === eventIndex ? "current" : ""}/>)}</div>
          <span className="ns-event-location">{currentEvent.station}</span><h2>{currentEvent.title}</h2><p className="ns-event-description">{currentEvent.description}</p>
          {notice && <p className="ns-notice" role="status">{notice}</p>}
          {eventOpen ? <div className="ns-choice-list" aria-label="Choose your response">{currentEvent.choices.map((choice, index) => <button className={`ns-choice ${chosenChoice === choice.id ? "is-chosen" : ""}`} type="button" key={choice.id} disabled={busy || blocked} onClick={() => choose(choice)} aria-pressed={chosenChoice === choice.id} aria-label={`${index + 1} ${choice.label}`}>
            <span className="ns-choice-number">0{index + 1}</span><span className="ns-choice-copy"><strong>{choice.label}</strong><small>{choice.effect.energy !== undefined ? `Energy ${choice.effect.energy > 0 ? "+" : ""}${choice.effect.energy}` : ""}{choice.effect.safety !== undefined ? ` · Safety ${choice.effect.safety > 0 ? "+" : ""}${choice.effect.safety}` : ""}{choice.effect.suspicion !== undefined ? ` · Suspicion ${choice.effect.suspicion > 0 ? "+" : ""}${choice.effect.suspicion}` : ""}</small></span><span className="ns-choice-arrow">↗</span>
          </button>)}</div> : <div className="ns-awaiting"><span className="ns-signal-icon">⌁</span><span><strong>Report to {currentEvent.station.toLowerCase()}</strong><small>Move close and press E, or tap the prompt.</small></span></div>}
          {reaction && <div className="ns-reaction" role="status" aria-live="polite"><span>FRIEND REPORT</span><p>{reaction}</p></div>}
        </section>
      </aside>
    </section>
    {settingsOpen && <div className="ns-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
      <section className="ns-settings" role="dialog" aria-modal="true" aria-labelledby="ns-settings-title"><div className="ns-settings-header"><div><span className="ns-eyebrow">SHIFT CONTROL</span><h2 id="ns-settings-title">Paused</h2></div><button className="ns-icon-button" type="button" aria-label="Resume shift" onClick={() => setSettingsOpen(false)}>×</button></div>
        <p>The room is holding. Take a moment before the next report.</p><label className="ns-toggle"><span><strong>Reduced motion</strong><small>Stop animated effects and Friend idle frames</small></span><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)}/><i/></label>
        <button className="ns-button ns-button-muted" type="button" onClick={toggleMute}>{muted ? "Enable sound" : "Mute sound"}</button>
        <button className="ns-button ns-button-primary" type="button" onClick={() => setSettingsOpen(false)}>Resume shift <span>→</span></button>
        <button className="ns-button ns-button-danger" type="button" onClick={restart}>Restart shift</button>
      </section>
    </div>}
  </main>;
}