"use client";

import { Copilot } from "./copilot/copilot";
import { Tour } from "./copilot/tour";

/** Mounted once in the root layout so the Copilot keeps its conversation across pages. */
export function GlobalWidgets() {
  return (
    <>
      <Copilot />
      <Tour />
    </>
  );
}
