import posthog from "posthog-js";

const POSTHOG_KEY = "phc_vVVWKup2SjPFSxEuwJBxJB3HYPPkbTiMvSU2SrGf9rsw";
const POSTHOG_HOST = "https://us.i.posthog.com";
const SESSION_PREFIX = "wildvault_analytics:";
const sentThisPage = new Set<string>();

type RenderingMode = "webgl" | "canvas";
type HazardKind = "crate" | "arch" | "spikes";

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
