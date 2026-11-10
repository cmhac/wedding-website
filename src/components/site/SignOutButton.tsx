"use client";

import { useState } from "react";
import { createGuestApiClient } from "@/lib/guest-api/client";

type Props = {
  client?: Pick<ReturnType<typeof createGuestApiClient>, "signOut">;
  navigate?: (path: string) => void;
};

/**
 * Ends this device's session (guest or staff), then reloads the home page,
 * which shows the sign-in prompt. Signing out never fails from the person's
 * point of view, so an error from the request still ends on the home page.
 */
export function SignOutButton({
  client = createGuestApiClient(),
  navigate = (path) => window.location.assign(path),
}: Props) {
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (pending) return;
    setPending(true);
    try {
      await client.signOut();
    } catch {
      // Carry on to the home page.
    }
    navigate("/");
  }

  return (
    <button
      type="button"
      className="link-btn"
      disabled={pending}
      onClick={onClick}
    >
      Sign out
    </button>
  );
}
