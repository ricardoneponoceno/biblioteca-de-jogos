/**
 * Walk-cycle inspection sandbox.
 *
 * Scrubs the widget's real CSS walk animations (the presence-* keyframes in
 * widget.css) on a full-size avatar via the Web Animations API, so the gait
 * is tuned in one place and this page just replays it.
 */
import { figureMarkup } from "../widget/figure.mjs";

const FRAME_STEP = 2;

const preview = document.getElementById("walk-preview");
const slider = document.getElementById("frame-slider");
const frameLabel = document.getElementById("frame-label");
const poseReadout = document.getElementById("pose-readout");
const playToggle = document.getElementById("play-toggle");
const prevFrame = document.getElementById("prev-frame");
const nextFrame = document.getElementById("next-frame");
const directionLeft = document.getElementById("direction-left");

if (
  !(preview instanceof HTMLElement)
  || !(slider instanceof HTMLInputElement)
  || !(frameLabel instanceof HTMLElement)
  || !(poseReadout instanceof HTMLOutputElement)
  || !(playToggle instanceof HTMLButtonElement)
  || !(prevFrame instanceof HTMLButtonElement)
  || !(nextFrame instanceof HTMLButtonElement)
  || !(directionLeft instanceof HTMLInputElement)
) {
  throw new Error("Walk sandbox controls not found");
}

const avatar = document.createElement("div");
avatar.className = "townsquare-avatar townsquare-avatar--preview townsquare-avatar--walking";
avatar.innerHTML = figureMarkup('aria-label="Walking figure"');
preview.appendChild(avatar);

const cycleMs = parseFloat(getComputedStyle(avatar).getPropertyValue("--walk-cycle")) * 1000;

let playing = true;
let animationFrame = null;

function animations() {
  return avatar.getAnimations({ subtree: true });
}

function currentFrame() {
  const time = Number(animations()[0]?.currentTime ?? 0);
  return ((((time % cycleMs) + cycleMs) % cycleMs) / cycleMs) * 100;
}

function setFrame(frame) {
  const time = ((((frame % 100) + 100) % 100) / 100) * cycleMs;
  for (const animation of animations()) {
    animation.currentTime = time;
  }
  renderReadout();
}

function jointMatrix(selector) {
  const element = avatar.querySelector(selector);
  const transform = element ? getComputedStyle(element).transform : "none";
  return transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
}

function jointAngle(selector) {
  const matrix = jointMatrix(selector);
  return Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
}

function renderReadout() {
  const frame = Math.round(currentFrame()) % 100;
  slider.value = String(frame);
  frameLabel.textContent = `Frame ${frame}`;
  poseReadout.value = [
    `body ${jointMatrix(".figure-core").f.toFixed(2)}px ${jointAngle(".figure-core").toFixed(1)}deg`,
    `leg-l ${jointAngle(".leg-l").toFixed(1)}deg`,
    `leg-r ${jointAngle(".leg-r").toFixed(1)}deg`,
    `arm-l ${jointAngle(".arm-l").toFixed(1)}deg`,
    `arm-r ${jointAngle(".arm-r").toFixed(1)}deg`,
  ].join(" · ");
}

function setPlaying(nextPlaying) {
  playing = nextPlaying;
  playToggle.textContent = playing ? "Pause" : "Play";
  for (const animation of animations()) {
    if (playing) animation.play();
    else animation.pause();
  }
}

function tick() {
  if (playing) renderReadout();
  animationFrame = requestAnimationFrame(tick);
}

slider.addEventListener("input", () => {
  setPlaying(false);
  setFrame(Number(slider.value));
});

playToggle.addEventListener("click", () => setPlaying(!playing));
prevFrame.addEventListener("click", () => {
  setPlaying(false);
  setFrame(currentFrame() - FRAME_STEP);
});
nextFrame.addEventListener("click", () => {
  setPlaying(false);
  setFrame(currentFrame() + FRAME_STEP);
});

// The scaleX(-1) flip alone handles facing left; the gait itself is
// direction-independent.
directionLeft.addEventListener("change", () => {
  avatar.classList.toggle("townsquare-avatar--flipped", directionLeft.checked);
});

renderReadout();
animationFrame = requestAnimationFrame(tick);

window.addEventListener("pagehide", () => {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
});
