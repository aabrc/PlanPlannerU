import { describe, expect, it } from "vitest";
import { buildHomeScheduleSummary } from "./scheduleSummary";
import type { ScheduleEvent } from "../types";

const event = (overrides: Partial<ScheduleEvent>): ScheduleEvent => ({
  id: "event",
  title: "Actividad",
  ...overrides
});

describe("buildHomeScheduleSummary", () => {
  it("ordena por día y hora y muestra como máximo tres bloques", () => {
    const summary = buildHomeScheduleSummary([
      event({ id: "fri", title: "Viernes", days: ["fri"], start: "08:00", end: "09:00" }),
      event({ id: "wed", title: "Miércoles", days: ["wed"], start: "07:00", end: "08:00" }),
      event({ id: "mon-late", title: "Lunes tarde", days: ["mon"], start: "12:00", end: "13:00" }),
      event({ id: "mon-early", title: "Lunes temprano", days: ["mon"], start: "08:00", end: "09:00" })
    ]);

    expect(summary.scheduledCount).toBe(4);
    expect(summary.items.map((item) => item.id)).toEqual(["mon-early", "mon-late", "wed"]);
    expect(summary.items[0]).toMatchObject({
      title: "Lunes temprano",
      days: "Lun",
      time: "08:00–09:00"
    });
  });

  it("cuenta las materias en curso que todavía no tienen días u horas", () => {
    const summary = buildHomeScheduleSummary([
      event({ id: "class-ready", courseCode: "ICC103", title: "Programación", days: ["mon"], start: "08:00", end: "10:00" }),
      event({ id: "class-pending", courseCode: "ITT112", title: "Redes", days: [], start: "", end: "" }),
      event({ id: "personal-empty", title: "Estudio", days: [], start: "", end: "" })
    ]);

    expect(summary.scheduledCount).toBe(1);
    expect(summary.pendingCourseCount).toBe(1);
  });

  it("identifica actividades que cruzan la medianoche", () => {
    const summary = buildHomeScheduleSummary([
      event({ id: "night", title: "Estudiar", days: ["sat"], start: "22:30", end: "01:00" })
    ]);

    expect(summary.items[0].time).toBe("22:30–01:00 (+1 día)");
  });

  it("devuelve una vista vacía cuando no existen actividades", () => {
    expect(buildHomeScheduleSummary([])).toEqual({
      scheduledCount: 0,
      pendingCourseCount: 0,
      items: []
    });
  });
});
