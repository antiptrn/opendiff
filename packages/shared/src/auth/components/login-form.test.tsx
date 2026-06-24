import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../test/test-utils";
import { LoginForm } from "./login-form";

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const originalLocation = window.location;

function renderLoginForm(props: React.ComponentProps<typeof LoginForm> = {}) {
  return render(<LoginForm {...props} />, { wrapper: createWrapper() });
}

async function getTurnstileScript() {
  await waitFor(() => {
    expect(document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)).toBeInTheDocument();
  });

  const script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
  expect(script).toBeInstanceOf(HTMLScriptElement);

  return script as HTMLScriptElement;
}

beforeEach(() => {
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...originalLocation, href: "" },
  });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  for (const script of document.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)) {
    script.remove();
  }
  window.turnstile = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("LoginForm", () => {
  it("keeps provider buttons hidden until Turnstile has produced a token", async () => {
    const onVerificationStatusChange = vi.fn();
    renderLoginForm({ onVerificationStatusChange });

    expect(screen.queryByRole("button", { name: /login with github/i })).not.toBeInTheDocument();

    const script = await getTurnstileScript();
    let callback: ((token: string) => void) | undefined;
    const execute = vi.fn(() => callback?.("turnstile-token"));
    window.turnstile = {
      render: vi.fn((_container, options) => {
        callback = options.callback;
        return "widget-id";
      }),
      execute,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    fireEvent.load(script);

    const githubButton = await screen.findByRole("button", { name: /login with github/i });
    expect(onVerificationStatusChange).toHaveBeenCalledWith("ready");
    const executeCallsBeforeClick = execute.mock.calls.length;

    fireEvent.click(githubButton);

    await waitFor(() => {
      expect(window.location.href).toContain("/auth/github");
      expect(window.location.href).toContain("turnstileToken=turnstile-token");
    });
    expect(execute).toHaveBeenCalledTimes(executeCallsBeforeClick);
  });

  it("waits for an already injected Turnstile script to load after remounting", async () => {
    const firstRender = renderLoginForm();
    const script = await getTurnstileScript();
    firstRender.unmount();

    const onVerificationStatusChange = vi.fn();
    renderLoginForm({ onVerificationStatusChange });

    expect(screen.queryByRole("button", { name: /login with github/i })).not.toBeInTheDocument();

    window.turnstile = {
      render: vi.fn((_container, options) => {
        options.callback("turnstile-token");
        return "widget-id";
      }),
      execute: vi.fn(),
      reset: vi.fn(),
      remove: vi.fn(),
    };

    fireEvent.load(script);

    await screen.findByRole("button", { name: /login with github/i });
    expect(onVerificationStatusChange).toHaveBeenCalledWith("ready");
  });

  it("does not call turnstile.ready after the async script loads", async () => {
    const onVerificationStatusChange = vi.fn();
    renderLoginForm({ onVerificationStatusChange });

    const script = await getTurnstileScript();
    const ready = vi.fn(() => {
      throw new Error("ready is incompatible with async script loading");
    });

    window.turnstile = {
      render: vi.fn((_container, options) => {
        options.callback("turnstile-token");
        return "widget-id";
      }),
      ready,
      execute: vi.fn(),
      reset: vi.fn(),
      remove: vi.fn(),
    };

    fireEvent.load(script);

    await screen.findByRole("button", { name: /login with github/i });
    expect(ready).not.toHaveBeenCalled();
    expect(onVerificationStatusChange).toHaveBeenCalledWith("ready");
  });
});
