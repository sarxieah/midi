const playbackStatus = document.querySelector("#playback-status");
const progressDisplay = document.querySelector("#progress-display");
const keyboardRoot = document.querySelector("#keyboard");
const midiSummary = document.querySelector("#midi-summary");

const KEYBOARD_START = 21;
const KEYBOARD_END = 108;
const WHITE_NOTES = new Set([0, 2, 4, 5, 7, 9, 11]);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const demoActiveNotes = [48, 52, 55, 60, 64, 67];
const MIDI_FILE_PATH = "assets/midi/seduction-rene-aubry.mid";

const appState = {
  midi: null,
  noteTimeline: [],
  pieceDuration: 0,
  pitchRange: null,
  tracks: [],
};

const setStatus = (status) => {
  playbackStatus.textContent = status;
};

const setMidiMessage = (message) => {
  midiSummary.textContent = message;
};

const formatSeconds = (seconds) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
  const remainder = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
};

const midiToNoteName = (midi) => {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
};

const buildKeyboard = () => {
  const whiteKeys = [];
  const blackKeys = [];
  let whiteIndex = 0;

  for (let midi = KEYBOARD_START; midi <= KEYBOARD_END; midi += 1) {
    const pitchClass = midi % 12;
    const noteName = midiToNoteName(midi);
    const isWhite = WHITE_NOTES.has(pitchClass);

    if (isWhite) {
      whiteKeys.push(
        `<button class="key key-white" type="button" data-midi="${midi}" aria-label="${noteName}">
          <span class="key-label">${noteName}</span>
        </button>`
      );
      whiteIndex += 1;
      continue;
    }

    blackKeys.push(
      `<button class="key key-black" type="button" data-midi="${midi}" aria-label="${noteName}" style="left: calc((100% / 52) * ${whiteIndex});">
        <span class="key-label">${noteName}</span>
      </button>`
    );
  }

  keyboardRoot.innerHTML = `
    <div class="keyboard-white">${whiteKeys.join("")}</div>
    <div class="keyboard-black">${blackKeys.join("")}</div>
  `;
};

const setActiveKeys = (midiNotes = []) => {
  const activeSet = new Set(midiNotes);

  keyboardRoot.querySelectorAll(".key").forEach((key) => {
    const midi = Number(key.dataset.midi);
    key.classList.toggle("active", activeSet.has(midi));
  });
};

const updateMidiSummary = () => {
  if (!appState.noteTimeline.length || !appState.pitchRange) {
    setMidiMessage("No note data available.");
    progressDisplay.textContent = "00:00 / 00:00";
    return;
  }

  const channelSummary = appState.tracks
    .map((track) => `T${track.index}:${track.channelLabel}`)
    .join("  ");

  setMidiMessage(
    `${appState.noteTimeline.length} notes across ${appState.tracks.length} tracks. ` +
    `Range ${midiToNoteName(appState.pitchRange.min)} to ${midiToNoteName(appState.pitchRange.max)}. ` +
    `Duration ${formatSeconds(appState.pieceDuration)}. ${channelSummary}`
  );

  progressDisplay.textContent = `00:00 / ${formatSeconds(appState.pieceDuration)}`;
};

const loadMidiData = async () => {
  if (window.location.protocol === "file:") {
    setStatus("Local server required");
    setMidiMessage("Open this project through a local static server, not by double-clicking index.html.");
    return;
  }

  if (!window.Midi || typeof window.Midi.fromUrl !== "function") {
    setStatus("MIDI parser missing");
    setMidiMessage("The MIDI parser script did not load. Check your internet connection or bundle the library locally.");
    return;
  }

  setStatus("Loading MIDI...");
  setMidiMessage(`Loading ${MIDI_FILE_PATH}...`);

  try {
    const midi = await window.Midi.fromUrl(MIDI_FILE_PATH);
    const noteTimeline = [];

    const tracks = midi.tracks
      .map((track, index) => {
        const notes = track.notes.map((note) => {
          const timelineNote = {
            midi: note.midi,
            name: note.name,
            pitch: note.midi,
            octave: Math.floor(note.midi / 12) - 1,
            time: note.time,
            duration: note.duration,
            velocity: note.velocity,
            ticks: note.ticks,
            durationTicks: note.durationTicks,
            trackIndex: index,
            trackName: track.name || `Track ${index + 1}`,
            channel: track.channel ?? null,
          };

          noteTimeline.push(timelineNote);
          return timelineNote;
        });

        return {
          index,
          name: track.name || `Track ${index + 1}`,
          channel: track.channel ?? null,
          channelLabel: track.channel ?? "na",
          noteCount: notes.length,
        };
      })
      .filter((track) => track.noteCount > 0);

    noteTimeline.sort((a, b) => {
      if (a.time !== b.time) {
        return a.time - b.time;
      }

      return a.midi - b.midi;
    });

    const pitchRange = noteTimeline.reduce(
      (range, note) => ({
        min: Math.min(range.min, note.midi),
        max: Math.max(range.max, note.midi),
      }),
      { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
    );

    appState.midi = midi;
    appState.noteTimeline = noteTimeline;
    appState.pieceDuration = midi.duration;
    appState.pitchRange = noteTimeline.length ? pitchRange : null;
    appState.tracks = tracks;

    updateMidiSummary();
    setStatus("Ready");

    console.table(
      appState.noteTimeline.slice(0, 12).map((note) => ({
        track: note.trackIndex,
        channel: note.channel,
        note: note.name,
        midi: note.midi,
        time: note.time.toFixed(3),
        duration: note.duration.toFixed(3),
        velocity: note.velocity.toFixed(3),
      }))
    );
    console.log("MIDI metadata", {
      duration: appState.pieceDuration,
      pitchRange: appState.pitchRange,
      tracks: appState.tracks,
      noteCount: appState.noteTimeline.length,
    });
  } catch (error) {
    setStatus("MIDI load failed");
    setMidiMessage("Failed to load MIDI data. Confirm the file path and check the browser console for the exact error.");
    console.error("Unable to load MIDI", error);
  }
};

buildKeyboard();
loadMidiData();

document.querySelector("#play-button").addEventListener("click", () => {
  setStatus("Playing");
  setActiveKeys(demoActiveNotes);
});

document.querySelector("#pause-button").addEventListener("click", () => {
  setStatus("Paused");
  setActiveKeys([]);
});

document.querySelector("#restart-button").addEventListener("click", () => {
  setStatus("Ready");
  progressDisplay.textContent = "00:00 / 00:00";
  setActiveKeys([]);
});
