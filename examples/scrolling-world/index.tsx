"use client";

import { useEffect, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

type EventChoice = {
  text: string;
  energy: number;
  safety: number;
  suspicion: number;
  reaction: string;
};

type NightEvent = {
  title: string;
  description: string;
  choices: EventChoice[];
};

const events: NightEvent[] = [
  {
    title: "Something Outside",
    description: "You hear footsteps outside the building. They stop right behind the door.",
    choices: [
      {
        text: "Check the security camera",
        energy: -5,
        safety: 5,
        suspicion: 0,
        reaction: "You check the camera carefully. Nothing is there.",
      },
      {
        text: "Ignore it",
        energy: 0,
        safety: -10,
        suspicion: 5,
        reaction: "You try to ignore the sound, but the footsteps start again.",
      },
    ],
  },
  {
    title: "The Lights Go Out",
    description: "The entire building suddenly goes dark. You are alone on the night shift.",
    choices: [
      {
        text: "Use your phone light",
        energy: -10,
        safety: 5,
        suspicion: 0,
        reaction: "Your phone gives you enough light to keep moving.",
      },
      {
        text: "Stay completely still",
        energy: 5,
        safety: -10,
        suspicion: 10,
        reaction: "You wait in the darkness. Something moves somewhere nearby.",
      },
    ],
  },
  {
    title: "A Knock",
    description: "Three slow knocks come from the main entrance.",
    choices: [
      {
        text: "Stay away from the door",
        energy: -5,
        safety: 10,
        suspicion: 0,
        reaction: "You stay quiet. After a few seconds, the knocking stops.",
      },
      {
        text: "Ask who is there",
        energy: -10,
        safety: -10,
        suspicion: 15,
        reaction: "No one answers. You really wish you had stayed quiet.",
      },
    ],
  },
  {
    title: "Security Alert",
    description: "The security monitor flashes red. One of the cameras has detected movement.",
    choices: [
      {
        text: "Check the monitor",
        energy: -10,
        safety: 5,
        suspicion: 5,
        reaction: "You watch the camera. The movement disappears.",
      },
      {
        text: "Turn the monitor off",
        energy: 5,
        safety: -10,
        suspicion: 15,
        reaction: "You shut the screen down. Now you cannot see what is happening.",
      },
    ],
  },
  {
    title: "The Storage Room",
    description: "A strange noise comes from the storage room. The door is slightly open.",
    choices: [
      {
        text: "Close the door",
        energy: -5,
        safety: 10,
        suspicion: 5,
        reaction: "You slowly close the door and lock it.",
      },
      {
        text: "Look inside",
        energy: -15,
        safety: -5,
        suspicion: 10,
        reaction: "You look inside. Boxes are everywhere, but you see nothing else.",
      },
    ],
  },
  {
    title: "The Phone Rings",
    description: "The old desk phone suddenly rings. Nobody should be calling this late.",
    choices: [
      {
        text: "Answer it",
        energy: -10,
        safety: -5,
        suspicion: 15,
        reaction: "You answer. There is only silence on the other end.",
      },
      {
        text: "Let it ring",
        energy: 5,
        safety: 5,
        suspicion: 0,
        reaction: "The phone stops. You decide it was better not to answer.",
      },
    ],
  },
  {
    title: "Something Moved",
    description: "You notice a chair across the room that was not in that position before.",
    choices: [
      {
        text: "Move away",
        energy: -5,
        safety: 10,
        suspicion: 5,
        reaction: "You keep your distance and watch the room.",
      },
      {
        text: "Walk closer",
        energy: -15,
        safety: -10,
        suspicion: 15,
        reaction: "You get closer. The chair is completely empty.",
      },
    ],
  },
  {
    title: "Almost Morning",
    description: "You check the clock. The shift is almost over. One last sound comes from the hallway.",
    choices: [
      {
        text: "Stay at your desk",
        energy: -5,
        safety: 10,
        suspicion: 0,
        reaction: "You stay where you are. The hallway becomes quiet again.",
      },
      {
        text: "Check the hallway",
        energy: -15,
        safety: -10,
        suspicion: 10,
        reaction: "You check the hallway and quickly return to your desk.",
      },
    ],
  },
];

export default function NightShift({
  friendId,
  client,
  paused,
}: GameComponentProps) {
  const [loaded, setLoaded] = useState(false);
  const [eventIndex, setEventIndex] = useState(0);
  const [energy, setEnergy] = useState(100);
  const [safety, setSafety] = useState(100);
  const [suspicion, setSuspicion] = useState(0);
  const [reaction, setReaction] = useState(
    "Your night shift has started. Stay calm."
  );
  const [result, setResult] = useState<"win" | "lose" | null>(null);
  const [menu, setMenu] = useState<"settings" | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;

    client
      .read()
      .then(snapshot => {
        if (active && snapshot.friendId === friendId) {
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setLoaded(true);
      });

    const preference = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    const updateMotion = () => setReducedMotion(preference.matches);
    updateMotion();

    preference.addEventListener("change", updateMotion);

    return () => {
      active = false;
      preference.removeEventListener("change", updateMotion);
    };
  }, [client, friendId]);

  function choose(choice: EventChoice) {
    if (paused || result) return;

    const nextEnergy = Math.max(0, Math.min(100, energy + choice.energy));
    const nextSafety = Math.max(0, Math.min(100, safety + choice.safety));
    const nextSuspicion = Math.max(
      0,
      Math.min(100, suspicion + choice.suspicion)
    );

    setEnergy(nextEnergy);
    setSafety(nextSafety);
    setSuspicion(nextSuspicion);
    setReaction(choice.reaction);

    if (
      nextEnergy <= 0 ||
      nextSafety <= 0 ||
      nextSuspicion >= 100
    ) {
      setResult("lose");
      return;
    }

    if (eventIndex >= events.length - 1) {
      setResult("win");
      return;
    }

    setEventIndex(eventIndex + 1);
  }

  function restart() {
    setEventIndex(0);
    setEnergy(100);
    setSafety(100);
    setSuspicion(0);
    setReaction("Your night shift has started. Stay calm.");
    setResult(null);
    setMenu(null);
  }

  if (!loaded) {
    return (
      <section className="night-shift-loading">
        <div>
          <h2>Night Shift</h2>
          <p>Starting your shift...</p>
        </div>
      </section>
    );
  }

  const currentEvent = events[eventIndex];

  return (
    <section
      className={`night-shift ${reducedMotion ? "reduced-motion" : ""}`}
      aria-label="Rare Friend Night Shift"
    >
      <div className="night-game">
        <header className="night-header">
          <div>
            <span className="night-label">RARE FRIEND</span>
            <h1>Night Shift</h1>
          </div>

          <button
            className="settings-button"
            type="button"
            onClick={() => setMenu("settings")}
          >
            ⚙
          </button>
        </header>

        <div className="night-screen">
          <div className="room">
            <div className="window">
              <span>02:47 AM</span>
            </div>

            <div className="desk">
              <div className="monitor">●</div>
              <div className="desk-light" />
            </div>

            <div className="friend-shadow">
              <div className="friend-face">◉</div>
              <div className="friend-body" />
            </div>

            <div className="door">
              <span>STAFF ONLY</span>
            </div>
          </div>

          <div className="stats">
            <div>
              <span>ENERGY</span>
              <div className="bar">
                <i style={{ width: `${energy}%` }} />
              </div>
              <b>{energy}</b>
            </div>

            <div>
              <span>SAFETY</span>
              <div className="bar">
                <i style={{ width: `${safety}%` }} />
              </div>
              <b>{safety}</b>
            </div>

            <div>
              <span>SUSPICION</span>
              <div className="bar danger">
                <i style={{ width: `${suspicion}%` }} />
              </div>
              <b>{suspicion}</b>
            </div>
          </div>

          {!result && (
            <div className="event-panel">
              <div className="event-number">
                EVENT {eventIndex + 1} / {events.length}
              </div>

              <h2>{currentEvent.title}</h2>
              <p>{currentEvent.description}</p>

              <div className="choices">
                {currentEvent.choices.map((choice, index) => (
                  <button
                    key={choice.text}
                    type="button"
                    disabled={paused}
                    onClick={() => choose(choice)}
                  >
                    <span>0{index + 1}</span>
                    {choice.text}
                  </button>
                ))}
              </div>

              <div className="reaction">{reaction}</div>
            </div>
          )}

          {result && (
            <div className="result-panel">
              <span className="result-label">
                {result === "win" ? "SHIFT COMPLETE" : "SHIFT FAILED"}
              </span>

              <h2>
                {result === "win"
                  ? "You made it to morning."
                  : "Something went wrong."}
              </h2>

              <p>
                {result === "win"
                  ? "The night is finally over. Your Friend survived the shift."
                  : "Your Friend could not make it through the night."}
              </p>

              <div className="final-stats">
                <span>Energy: {energy}</span>
                <span>Safety: {safety}</span>
                <span>Suspicion: {suspicion}</span>
              </div>

              <button
                className="restart-button"
                type="button"
                onClick={restart}
              >
                Work another shift
              </button>
            </div>
          )}
        </div>

        <footer className="night-footer">
          <span>FRIEND ID: {friendId.toString()}</span>
          <span>Stay until 06:00 AM</span>
        </footer>
      </div>

      {menu && (
        <GameMenu
          title="Settings"
          onClose={() => setMenu(null)}
        >
          <button
            type="button"
            onClick={() => setReducedMotion(value => !value)}
          >
            {reducedMotion ? "Motion: Reduced" : "Motion: Normal"}
          </button>

          <p>
            Night Shift is a simulated experience. No real purchases or
            transactions are made.
          </p>
        </GameMenu>
      )}
    </section>
  );
}