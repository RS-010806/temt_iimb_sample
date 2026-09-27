/** Plain names for engine adjustments, without their internal parameters. */
export const adjustmentName = (label: string) =>
  /refrigerat/i.test(label) ? "Temperature-controlled cargo" : /sea distance/i.test(label) ? "GLEC sea distance adjustment" : label.replace(/\s*\(.*\)$/, "");
