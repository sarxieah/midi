const playbackStatus = document.querySelector("#playback-status");
const progressDisplay = document.querySelector("#progress-display");
const keyboardRoot = document.querySelector("#keyboard");
const canvas = document.querySelector("#note-canvas");
const placeholder = document.querySelector("#visualizer-placeholder");
const placeholderLabel = placeholder.querySelector("strong");
const visualizerShell = document.querySelector(".visualizer-canvas-shell");
const seekBar = document.querySelector("#seek-bar");
const seekCurrent = document.querySelector("#seek-current");
const seekDuration = document.querySelector("#seek-duration");
const audio = document.querySelector("#piece-audio");
const hitLine = document.querySelector(".hit-line");
const canvasContext = canvas.getContext("2d");

const PIECE = {
  title: "Seduction",
  midiPath: "assets/midi/seduction-rene-aubry.mid",
  audioPath: "assets/audio/seduction-rene-aubry.mp3",
  colors: {
    accent: "#cab9a3",
    rightHand: "#ff8f2c",
    rightGlow: "#ff8f2c",
    leftHand: "#cbb79d",
    leftGlow: "#cbb79d",
  },
  handSplitMidi: 67,
  pitchRange: { min: 32, max: 100 },
  visibleRangeDesktop: { min: 32, max: 100 },
  visibleRangeMobile: { min: 40, max: 88 },
  showTrackMode: "all",
  scrollSpeed: 150,
  visibleAheadSeconds: 3.1,
  startingOffset: 0,
  endPadding: 1.5,
  firstNoteLeadIn: 0.9,
};

const WHITE_NOTES = new Set([0, 2, 4, 5, 7, 9, 11]);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const devicePixelRatioValue = window.devicePixelRatio || 1;

const appState = {
  midi: null,
  midiReady: false,
  audioReady: false,
  noteTimeline: [],
  filteredTimeline: [],
  pieceDuration: 0,
  laneMap: new Map(),
  layoutReady: false,
  resizeFrame: 0,
  renderFrame: 0,
  isScrubbing: false,
};

const setStatus = (status) => {
  playbackStatus.textContent = status;
};

const setOverlayState = (state) => {
  placeholder.dataset.state = state;

  if (state === "hidden") {
    placeholder.hidden = true;
    return;
  }

  placeholder.hidden = false;
  if (state === "loading") {
    placeholderLabel.textContent = "loading";
  } else if (state === "paused") {
    placeholderLabel.textContent = "paused";
  } else {
    placeholderLabel.textContent = "press play to start";
  }
  placeholder.setAttribute(
    "aria-label",
    state === "loading"
      ? "Loading"
      : state === "paused"
        ? "Paused. Press to resume playback"
        : "Press play to start"
  );
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

const getVisibleRange = () => (
  window.innerWidth <= 720 ? PIECE.visibleRangeMobile : PIECE.visibleRangeDesktop
);

const isVisiblePitch = (midi) => {
  const range = getVisibleRange();
  return midi >= range.min && midi <= range.max;
};

const getHandClass = (midi) => (midi < PIECE.handSplitMidi ? "left" : "right");

const isPieceReady = () => appState.midiReady && appState.audioReady && appState.layoutReady;

const buildKeyboard = () => {
  const whiteKeys = [];
  const blackKeys = [];
  const visibleRange = getVisibleRange();
  let whiteIndex = 0;

  for (let midi = visibleRange.min; midi <= visibleRange.max; midi += 1) {
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
      `<button class="key key-black" type="button" data-midi="${midi}" aria-label="${noteName}" style="left: calc((100% / 52) * ${whiteIndex});"></button>`
    );
  }

  keyboardRoot.innerHTML = `
    <div class="keyboard-white">${whiteKeys.join("")}</div>
    <div class="keyboard-black">${blackKeys.join("")}</div>
  `;
};

const setActiveKeys = (midiNotes = []) => {
  const activeMap = new Map(midiNotes.map((midi) => [midi, getHandClass(midi)]));

  keyboardRoot.querySelectorAll(".key").forEach((key) => {
    const midi = Number(key.dataset.midi);
    const handClass = activeMap.get(midi);
    key.classList.toggle("active", Boolean(handClass));
    key.classList.toggle("active-left", handClass === "left");
    key.classList.toggle("active-right", handClass === "right");
  });
};

const syncTheme = () => {
  document.documentElement.style.setProperty("--accent", PIECE.colors.accent);
  document.documentElement.style.setProperty("--accent-soft", "rgba(202, 185, 163, 0.18)");
  document.title = "Queens Gambit";
  audio.src = PIECE.audioPath;
  audio.load();
};

const updateMidiSummary = () => {
  if (!appState.filteredTimeline.length) {
    progressDisplay.textContent = "00:00 / 00:00";
    seekCurrent.textContent = "00:00";
    seekDuration.textContent = "00:00";
    seekBar.value = "0";
    return;
  }

  progressDisplay.textContent = `00:00 / ${formatSeconds(appState.pieceDuration)}`;
  seekCurrent.textContent = "00:00";
  seekDuration.textContent = formatSeconds(appState.pieceDuration);
  seekBar.value = "0";
};

const updateSeekUI = (currentTime) => {
  const duration = Math.max(appState.pieceDuration, audio.duration || 0);
  const progress = duration > 0 ? Math.min(1000, Math.max(0, Math.round((currentTime / duration) * 1000))) : 0;

  if (!appState.isScrubbing) {
    seekBar.value = String(progress);
  }

  seekCurrent.textContent = formatSeconds(currentTime);
  seekDuration.textContent = formatSeconds(duration);
  progressDisplay.textContent = `${formatSeconds(currentTime)} / ${formatSeconds(duration)}`;
};

const updateReadyState = () => {
  const ready = isPieceReady();

  if (!ready) {
    setOverlayState("loading");
    if (!appState.midiReady) {
      setStatus("Loading MIDI...");
    } else if (!appState.audioReady) {
      setStatus("Loading audio...");
    } else {
      setStatus("Sizing stage...");
    }
    return;
  }

  if (!audio.paused) {
    setOverlayState("hidden");
  } else if (audio.currentTime > 0 && !audio.ended) {
    setOverlayState("paused");
  } else {
    setOverlayState("start");
  }

  setStatus(audio.paused ? "Ready" : "Playing");
  renderFrame();
};

const pickTrackTimeline = (notes) => {
  if (PIECE.showTrackMode === "all") {
    return notes;
  }

  return notes.filter((note) => note.trackIndex === 0);
};

const loadMidiData = async () => {
  if (window.location.protocol === "file:") {
    setStatus("Local server required");
    return;
  }

  if (!window.Midi || typeof window.Midi.fromUrl !== "function") {
    setStatus("MIDI parser missing");
    return;
  }

  try {
    const midi = await window.Midi.fromUrl(PIECE.midiPath);
    const noteTimeline = [];

    midi.tracks.forEach((track, index) => {
      track.notes.forEach((note) => {
        noteTimeline.push({
          midi: note.midi,
          name: note.name,
          time: note.time,
          duration: note.duration,
          velocity: note.velocity,
          end: note.time + note.duration,
          trackIndex: index,
          channel: track.channel ?? null,
          channelLabel: track.channel ?? "na",
        });
      });
    });

    noteTimeline.sort((a, b) => {
      if (a.time !== b.time) {
        return a.time - b.time;
      }

      return a.midi - b.midi;
    });

    appState.midi = midi;
    appState.noteTimeline = noteTimeline;
    appState.filteredTimeline = pickTrackTimeline(noteTimeline).filter((note) => (
      note.midi >= PIECE.pitchRange.min && note.midi <= PIECE.pitchRange.max
    ));
    appState.pieceDuration = midi.duration + PIECE.endPadding;
    appState.midiReady = true;

    updateMidiSummary();
    updateReadyState();
  } catch (error) {
    setStatus("MIDI load failed");
    console.error("Unable to load MIDI", error);
  }
};

const measureLanes = () => {
  const canvasRect = canvas.getBoundingClientRect();
  const laneMap = new Map();

  keyboardRoot.querySelectorAll(".key").forEach((key) => {
    const midi = Number(key.dataset.midi);

    if (!isVisiblePitch(midi)) {
      return;
    }

    const rect = key.getBoundingClientRect();
    laneMap.set(midi, {
      x: rect.left - canvasRect.left,
      width: rect.width,
    });
  });

  appState.laneMap = laneMap;
  appState.layoutReady = laneMap.size > 0;
};

const resizeCanvas = () => {
  buildKeyboard();

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  canvas.width = Math.round(width * devicePixelRatioValue);
  canvas.height = Math.round(height * devicePixelRatioValue);
  canvasContext.setTransform(devicePixelRatioValue, 0, 0, devicePixelRatioValue, 0, 0);

  measureLanes();
  updateReadyState();
};

const queueResize = () => {
  cancelAnimationFrame(appState.resizeFrame);
  appState.resizeFrame = requestAnimationFrame(resizeCanvas);
};

const getPlaybackTime = () => Math.max(0, audio.currentTime + PIECE.startingOffset);

const getNotePalette = (note) => {
  if (getHandClass(note.midi) === "left") {
    return {
      fill: PIECE.colors.leftHand,
      glow: PIECE.colors.leftGlow,
    };
  }

  return {
    fill: PIECE.colors.rightHand,
    glow: PIECE.colors.rightGlow,
  };
};

const renderBackground = (width, height) => {
  canvasContext.clearRect(0, 0, width, height);
  canvasContext.fillStyle = "#ffffff";
  canvasContext.fillRect(0, 0, width, height);

  appState.laneMap.forEach((lane) => {
    canvasContext.fillStyle = "rgba(17, 14, 10, 0.045)";
    canvasContext.fillRect(lane.x, 0, 1, height);
  });

  const hitLineY = hitLine.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
  const sectionHeight = Math.max(56, Math.round(hitLineY / 5));
  for (let y = 0; y <= height; y += sectionHeight) {
    canvasContext.fillStyle = "rgba(17, 14, 10, 0.055)";
    canvasContext.fillRect(0, y, width, 1);
  }

  appState.laneMap.forEach((lane, midi) => {
    const alpha = WHITE_NOTES.has(midi % 12) ? 0.06 : 0.03;
    canvasContext.fillStyle = `rgba(17, 14, 10, ${alpha})`;
    canvasContext.fillRect(lane.x, 0, lane.width, height);
  });
};

const renderNotes = (currentTime) => {
  const width = canvas.width / devicePixelRatioValue;
  const height = canvas.height / devicePixelRatioValue;
  const hitLineY = hitLine.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
  const pxPerSecond = Math.min(PIECE.scrollSpeed, hitLineY / PIECE.visibleAheadSeconds);
  const noteRadius = 8;

  renderBackground(width, height);

  appState.filteredTimeline.forEach((note) => {
    const lane = appState.laneMap.get(note.midi);

    if (!lane) {
      return;
    }

    const noteHeight = Math.max(8, note.duration * pxPerSecond);
    const noteBottom = hitLineY - ((note.time - currentTime) * pxPerSecond);
    const noteTop = noteBottom - noteHeight;

    if (noteBottom < -24 || noteTop > height + 24) {
      return;
    }

    const palette = getNotePalette(note);

    canvasContext.fillStyle = palette.glow;
    canvasContext.fillRect(lane.x, noteTop, lane.width, noteHeight);

    canvasContext.fillStyle = palette.fill;
    canvasContext.beginPath();
    canvasContext.roundRect(lane.x + 1, noteTop, Math.max(4, lane.width - 2), noteHeight, noteRadius);
    canvasContext.fill();
  });
};

const getActiveMidiNotes = (currentTime) => {
  const active = [];

  appState.filteredTimeline.forEach((note) => {
    if (currentTime >= note.time && currentTime <= note.end) {
      active.push(note.midi);
    }
  });

  return active;
};

const renderFrame = () => {
  cancelAnimationFrame(appState.renderFrame);

  if (!isPieceReady()) {
    return;
  }

  const currentTime = getPlaybackTime();
  renderNotes(currentTime);
  setActiveKeys(getActiveMidiNotes(currentTime));
  updateSeekUI(currentTime);

  if (!audio.paused && !audio.ended) {
    appState.renderFrame = requestAnimationFrame(renderFrame);
  }
};

const safeSeek = (time) => {
  audio.currentTime = Math.max(0, Math.min(time, audio.duration || time));
  renderFrame();
};

const seekFromRangeValue = (value) => {
  const duration = Math.max(appState.pieceDuration, audio.duration || 0);
  const nextTime = duration > 0 ? (Number(value) / 1000) * duration : 0;
  safeSeek(nextTime);
};

const startPlayback = async () => {
  if (!isPieceReady()) {
    setStatus(appState.midiReady ? "Loading audio..." : "Loading MIDI...");
    return;
  }

  try {
    if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.05)) {
      safeSeek(0);
    }

    setOverlayState("hidden");
    await audio.play();
    setStatus("Playing");
    renderFrame();
  } catch (error) {
    setStatus("Click to start");
    setOverlayState(audio.currentTime > 0 ? "paused" : "start");
    console.error("Audio playback blocked", error);
  }
};

const pausePlayback = () => {
  audio.pause();
  setStatus("Paused");
  renderFrame();
};

const restartPlayback = async () => {
  if (!isPieceReady()) {
    return;
  }

  safeSeek(0);
  setActiveKeys([]);
  setStatus("Ready");
};

setStatus("Loading MIDI...");

audio.addEventListener("loadedmetadata", () => {
  appState.audioReady = true;
  updateSeekUI(0);
  updateReadyState();
});

audio.addEventListener("ended", () => {
  setStatus("Ended");
  setActiveKeys([]);
  setOverlayState("start");
  updateSeekUI(Math.max(0, audio.duration || appState.pieceDuration));
  renderFrame();
});

audio.addEventListener("pause", () => {
  if (!audio.ended && isPieceReady()) {
    setStatus("Paused");
    setOverlayState(audio.currentTime > 0 ? "paused" : "start");
  }
});

audio.addEventListener("play", () => {
  if (isPieceReady()) {
    setStatus("Playing");
    setOverlayState("hidden");
  }
});

placeholder.addEventListener("click", startPlayback);
placeholder.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    startPlayback();
  }
});
visualizerShell.addEventListener("click", (event) => {
  if (placeholder.contains(event.target)) {
    return;
  }

  if (!isPieceReady()) {
    return;
  }

  if (!audio.paused) {
    pausePlayback();
    return;
  }

  if (audio.currentTime > 0 && !audio.ended) {
    startPlayback();
  }
});
seekBar.addEventListener("pointerdown", () => {
  appState.isScrubbing = true;
});
seekBar.addEventListener("input", (event) => {
  seekFromRangeValue(event.target.value);
});
seekBar.addEventListener("change", (event) => {
  appState.isScrubbing = false;
  seekFromRangeValue(event.target.value);
});
seekBar.addEventListener("pointerup", () => {
  appState.isScrubbing = false;
});
window.addEventListener("resize", queueResize);

syncTheme();
if (audio.readyState >= 1) {
  appState.audioReady = true;
}
resizeCanvas();
updateReadyState();
loadMidiData();
renderFrame();
