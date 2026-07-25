import posthog from "posthog-js";

const POSTHOG_KEY = "phc_vVVWKup2SjPFSxEuwJBxJB3HYPPkbTiMvSU2SrGf9rsw";
const POSTHOG_HOST = "https://us.i.posthog.com";
const SESSION_PREFIX = "wildvault_analytics:";
const RUN_NUMBER_KEY = `${SESSION_PREFIX}run_number`;
const sentThisPage = new Set<string>();
const sharedRunNumbers = new Set<number>();
const endedRunNumbers = new Set<number>();
let runNumberFallback = 0;

type RenderingMode = "webgl" | "canvas";
type HazardKind = "crate" | "arch" | "spikes";
type RunMode = "free" | "daily";
type ShareMethod = "native" | "clipboard";
type ChallengeOutcome = "beat" | "tied" | "missed" | "not_applicable";

function deviceType() {
  const mobileUserAgent = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return mobileUserAgent || coarsePointer ? "mobile" : "desktop";
}

function captureOnce(
  sessionKey: string,
  event: "game_opened" | "first_value_reached",
  properties: Record<string, string | number>,
) {
  if (sentThisPage.has(sessionKey)) return;

  try {
    if (sessionStorage.getItem(`${SESSION_PREFIX}${sessionKey}`)) return;
    sessionStorage.setItem(`${SESSION_PREFIX}${sessionKey}`, "1");
  } catch {
    sentThisPage.add(sessionKey);
  }

  posthog.capture(event, properties);
}

const testRun = new URLSearchParams(location.search).get("e2e_run");

posthog.init(POSTHOG_KEY, {
  api_host: POSTHOG_HOST,
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,
  disable_compression: Boolean(testRun),
  disable_session_recording: true,
  person_profiles: "identified_only",
  request_batching: !testRun,
  loaded: (client) => {
    if (testRun) {
      client.register({
        is_e2e_test: true,
        e2e_run: testRun,
      });
    }
  },
});

export function captureGameOpened(renderingMode: RenderingMode) {
  captureOnce("game_opened", "game_opened", {
    device_type: deviceType(),
    rendering_mode: renderingMode,
  });
}

export function captureRunStarted(
  renderingMode: RenderingMode,
  runMode: RunMode,
  challengePresent: boolean,
) {
  let runNumber = runNumberFallback + 1;

  try {
    const storedRunNumber = Number.parseInt(
      sessionStorage.getItem(RUN_NUMBER_KEY) ?? "0",
      10,
    );
    runNumber =
      (Number.isFinite(storedRunNumber) && storedRunNumber >= 0
        ? storedRunNumber
        : 0) + 1;
    sessionStorage.setItem(RUN_NUMBER_KEY, String(runNumber));
  } catch {}
  runNumberFallback = runNumber;

  posthog.capture("run_started", {
    run_number: runNumber,
    run_mode: runMode,
    challenge_present: challengePresent,
    device_type: deviceType(),
    rendering_mode: renderingMode,
  });

  return runNumber;
}

export function captureRunResultShared(
  renderingMode: RenderingMode,
  runNumber: number,
  runMode: RunMode,
  challengePresent: boolean,
  shareMethod: ShareMethod,
  distance: number,
  relics: number,
) {
  if (sharedRunNumbers.has(runNumber)) return;
  sharedRunNumbers.add(runNumber);

  posthog.capture("run_result_shared", {
    run_number: runNumber,
    run_mode: runMode,
    challenge_present: challengePresent,
    share_method: shareMethod,
    distance_m: Math.max(0, Math.min(99_999, Math.floor(distance))),
    relic_count: Math.max(0, Math.min(9_999, Math.floor(relics))),
    device_type: deviceType(),
    rendering_mode: renderingMode,
  });
}

export function captureRunEnded(
  renderingMode: RenderingMode,
  runNumber: number,
  runMode: RunMode,
  challengeTarget: number | null,
  distance: number,
  relics: number,
  newDistanceBest: boolean,
) {
  if (endedRunNumbers.has(runNumber)) return;
  endedRunNumbers.add(runNumber);

  const distanceM = Math.max(0, Math.min(99_999, Math.floor(distance)));
  const challengeOutcome: ChallengeOutcome =
    challengeTarget === null
      ? "not_applicable"
      : distanceM > challengeTarget
        ? "beat"
        : distanceM === challengeTarget
          ? "tied"
          : "missed";

  posthog.capture("run_ended", {
    run_number: runNumber,
    run_mode: runMode,
    distance_m: distanceM,
    relic_count: Math.max(0, Math.min(9_999, Math.floor(relics))),
    new_distance_best: newDistanceBest,
    challenge_present: challengeTarget !== null,
    challenge_outcome: challengeOutcome,
    device_type: deviceType(),
    rendering_mode: renderingMode,
  });
}

export function captureFirstValue(
  renderingMode: RenderingMode,
  hazardKind: HazardKind,
  distance: number,
) {
  captureOnce("first_value_reached", "first_value_reached", {
    device_type: deviceType(),
    rendering_mode: renderingMode,
    obstacle_kind: hazardKind,
    distance_m: Math.floor(distance),
  });
}
