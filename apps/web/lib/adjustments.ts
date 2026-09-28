/** Plain names for engine adjustments, without their internal parameters. */
export const adjustmentName = (label: string) =>
  /refrigerat/i.test(label) ? "Temperature-controlled cargo" : /sea distance/i.test(label) ? "Sailed-distance adjustment" : label.replace(/\s*\(.*\)$/, "");
