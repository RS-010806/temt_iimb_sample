import type { Filters } from "../analytics";
import { buildReportModel, reportFileStem, type ReportModel } from "../report-model";
import { actions, getState, selectComputed } from "../store";
import { exportCsv, exportJson, EXPORT_FORMATS, type ExportFormat } from "./common";

export { EXPORT_FORMATS, type ExportFormat };

export async function exportReport(format: ExportFormat, model: ReportModel) {
  const stem = reportFileStem(model);
  if (format === "csv") await exportCsv(model, stem);
  else if (format === "json") exportJson(model, stem);
  else if (format === "xlsx") await (await import("./xlsx")).exportXlsx(model, stem);
  else if (format === "pdf") await (await import("./pdf")).exportPdf(model, stem);
  else if (format === "docx") await (await import("./docx")).exportDocx(model, stem);
  else await (await import("./powerbi")).exportPowerBi(model, stem);
  actions.log("Report exported", `${EXPORT_FORMATS.find((item) => item.id === format)?.label} · ${model.period}`);
}

/** Export the current workspace from anywhere (used by the Copilot). */
export async function exportWorkspace(format: ExportFormat, filters: Filters) {
  const state = getState();
  const model = buildReportModel(selectComputed(state), state.settings, filters);
  await exportReport(format, model);
  return model;
}
