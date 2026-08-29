"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

function interactiveTarget(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>("button, a[href], summary, [role='button']")
    : null;
}

export function InteractionFeedback() {
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMessage(null);
  }, [pathname]);

  useEffect(() => {
    const clearMessageTimer = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };

    const press = (element: HTMLElement | null) => {
      if (!element || element.getAttribute("aria-disabled") === "true") return;
      if (element instanceof HTMLButtonElement && element.disabled) return;
      element.dataset.interactionPressed = "true";
      window.setTimeout(() => {
        delete element.dataset.interactionPressed;
      }, 220);
    };

    const onPointerDown = (event: PointerEvent) => {
      press(interactiveTarget(event.target));
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      if (form.dataset.submitting === "true") {
        event.preventDefault();
        return;
      }

      const submitter =
        event.submitter instanceof HTMLElement
          ? event.submitter
          : form.querySelector<HTMLElement>(
              "button[type='submit'], button:not([type]), input[type='submit']",
            );

      form.dataset.submitting = "true";
      form.setAttribute("aria-busy", "true");
      press(submitter);

      if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
        submitter.disabled = true;
      }

      clearMessageTimer();
      setMessage(submitter?.dataset.feedback || "Working…");

      timer.current = setTimeout(() => {
        if (!form.isConnected) return;
        delete form.dataset.submitting;
        form.removeAttribute("aria-busy");
        if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
          submitter.disabled = false;
        }
        setMessage(null);
      }, 8000);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("submit", onSubmit, true);

    return () => {
      clearMessageTimer();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-black/10 bg-[#111318]/95 px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_40px_rgba(0,0,0,.22)] backdrop-blur"
    >
      <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
      {message}
    </div>
  );
}
