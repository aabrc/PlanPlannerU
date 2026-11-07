import type { ScheduleEvent } from "../types";

const DAY_LABELS: Record<string, string> = {
  mon: "Lun",
  tue: "Mar",
  wed: "Mié",
  thu: "Jue",
  fri: "Vie",
  sat: "Sáb",
  sun: "Dom"
};

const DAY_ORDER: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6
};

export interface HomeScheduleItem {
  id: string;
  title: string;
  days: string;
  time: string;
}

export interface HomeScheduleSummary {
  scheduledCount: number;
  pendingCourseCount: number;
  items: HomeScheduleItem[];
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function hasSchedule(event: ScheduleEvent): boolean {
  return Boolean(event.days?.length && event.start && event.end);
}

/** Builds the compact weekly overview shown on the home page. */
export function buildHomeScheduleSummary(events: ScheduleEvent[]): HomeScheduleSummary {
  const scheduled = events.filter(hasSchedule);
  const pendingCourses = events.filter((event) => Boolean(event.courseCode) && !hasSchedule(event));

  const items = scheduled
    .slice()
    .sort((a, b) => {
      const firstDayA = Math.min(...(a.days || []).map((day) => DAY_ORDER[day] ?? 7));
      const firstDayB = Math.min(...(b.days || []).map((day) => DAY_ORDER[day] ?? 7));
      return firstDayA - firstDayB || toMinutes(a.start || "00:00") - toMinutes(b.start || "00:00");
    })
    .slice(0, 3)
    .map((event) => {
      const start = event.start || "";
      const end = event.end || "";
      const overnight = toMinutes(end) < toMinutes(start);

      return {
        id: event.id,
        title: (event.courseCode ? event.courseCode + " · " : "") + event.title,
        days: (event.days || []).map((day) => DAY_LABELS[day] || day).join(", "),
        time: start + "–" + end + (overnight ? " (+1 día)" : "")
      };
    });

  return {
    scheduledCount: scheduled.length,
    pendingCourseCount: pendingCourses.length,
    items
  };
}
