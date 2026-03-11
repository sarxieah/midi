const playbackStatus = document.querySelector("#playback-status");
const progressDisplay = document.querySelector("#progress-display");

const setStatus = (status) => {
  playbackStatus.textContent = status;
};

document.querySelector("#play-button").addEventListener("click", () => {
  setStatus("Playing");
});

document.querySelector("#pause-button").addEventListener("click", () => {
  setStatus("Paused");
});

document.querySelector("#restart-button").addEventListener("click", () => {
  setStatus("Ready");
  progressDisplay.textContent = "00:00 / 00:00";
});
