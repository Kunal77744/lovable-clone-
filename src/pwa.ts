interface InstallChoice {
  outcome: "accepted" | "dismissed";
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<InstallChoice>;
}

function isStandalone() {
  return matchMedia("(display-mode: standalone)").matches;
}

export function setupPwa(installButton: HTMLButtonElement) {
  let pendingPrompt: InstallPromptEvent | null = null;

  installButton.hidden = true;
  if (isStandalone()) return;

  addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingPrompt = event as InstallPromptEvent;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!pendingPrompt) return;
    const prompt = pendingPrompt;
    pendingPrompt = null;
    installButton.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } finally {
      installButton.hidden = true;
      installButton.disabled = false;
    }
  });

  addEventListener("appinstalled", () => {
    pendingPrompt = null;
    installButton.hidden = true;
  });

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    addEventListener("load", () => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    });
  }
}
