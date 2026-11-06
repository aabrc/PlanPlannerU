import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { ScheduleEvent, ScheduleViewRange } from "../types";

const DAYS = [
  { id: "mon", name: "Lunes", short: "Lun" },
  { id: "tue", name: "Martes", short: "Mar" },
  { id: "wed", name: "Miércoles", short: "Mié" },
  { id: "thu", name: "Jueves", short: "Jue" },
  { id: "fri", name: "Viernes", short: "Vie" },
  { id: "sat", name: "Sábado", short: "Sáb" },
  { id: "sun", name: "Domingo", short: "Dom" }
] as const;

const COLORS = [
  { id: "blue", name: "Azul", bg: "#dcebf8", border: "#a9c8df", text: "#426782" },
  { id: "sky", name: "Celeste", bg: "#e0f2fe", border: "#a5d8f5", text: "#17648a" },
  { id: "cyan", name: "Cian", bg: "#cffafe", border: "#9be5ec", text: "#176a73" },
  { id: "teal", name: "Turquesa", bg: "#ccfbf1", border: "#91ded0", text: "#176b61" },
  { id: "green", name: "Verde", bg: "#dcfce7", border: "#a9e2bb", text: "#286b43" },
  { id: "lime", name: "Lima", bg: "#ecfccb", border: "#c7e79a", text: "#55752b" },
  { id: "yellow", name: "Amarillo", bg: "#fef9c3", border: "#eee28b", text: "#806b1d" },
  { id: "amber", name: "Ámbar", bg: "#fef3c7", border: "#f1d58a", text: "#8b611d" },
  { id: "orange", name: "Naranja", bg: "#ffedd5", border: "#f4c89a", text: "#94551f" },
  { id: "coral", name: "Coral", bg: "#ffe4d6", border: "#efbaa4", text: "#99563e" },
  { id: "red", name: "Rojo", bg: "#fee2e2", border: "#f2b6b6", text: "#9b4545" },
  { id: "rose", name: "Rosa", bg: "#ffe4e6", border: "#f2b9c2", text: "#9a4b5e" },
  { id: "pink", name: "Fucsia", bg: "#fce7f3", border: "#efb9d8", text: "#984a79" },
  { id: "purple", name: "Púrpura", bg: "#f3e8ff", border: "#d8b8f2", text: "#70458c" },
  { id: "violet", name: "Violeta", bg: "#ede9fe", border: "#c7baf4", text: "#594b93" },
  { id: "slate", name: "Gris azulado", bg: "#e2e8f0", border: "#bdc9d8", text: "#475569" }
] as const;

const HOUR_HEIGHT = 48;
type Draft = { id: string; courseCode: string; title: string; days: string[]; start: string; end: string; color: string };
type Segment = { event: ScheduleEvent; start: number; end: number; part: "full" | "start" | "end"; lane: number; lanes: number };

const emptyDraft = (): Draft => ({ id: "", courseCode: "", title: "", days: [], start: "08:00", end: "09:00", color: "blue" });
const toMinutes = (value?: string) => { const [h, m] = (value || "00:00").split(":").map(Number); return h * 60 + m; };
const fromMinutes = (value: number) => `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const TIME_OPTIONS = Array.from({ length: 49 }, (_, index) => index * 30);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const PRINT_HOUR_HEIGHT = 24;
const formatAxisMinutes = (value: number) => value === 1440 ? "24:00" : fromMinutes(value);
const formatClock = (value: number) => {
  if (value === 1440) return "12:00 a. m. (fin del día)";
  const hour24 = Math.floor(value / 60) % 24;
  const hour12 = hour24 % 12 || 12;
  const minute = String(value % 60).padStart(2, "0");
  const period = hour24 >= 12 ? "p. m." : "a. m.";
  return `${hour12}:${minute} ${period}`;
};
const formatStoredClock = (value?: string) => formatClock(toMinutes(value));
const hasSchedule = (event: ScheduleEvent) => !!event.days?.length && !!event.start && !!event.end;
const makeId = () => globalThis.crypto?.randomUUID?.() || `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function segmentsForDay(event: ScheduleEvent, dayIndex: number) {
  if (!event.days?.length || !event.start || !event.end) return [] as Omit<Segment, "lane" | "lanes">[];
  const start = toMinutes(event.start), end = toMinutes(event.end);
  const current = DAYS[dayIndex].id, previous = DAYS[(dayIndex + 6) % 7].id;
  if (end > start) return event.days.includes(current) ? [{ event, start, end, part: "full" as const }] : [];
  const result: Omit<Segment, "lane" | "lanes">[] = [];
  if (event.days.includes(current)) result.push({ event, start, end: 1440, part: "start" });
  if (event.days.includes(previous) && end > 0) result.push({ event, start: 0, end, part: "end" });
  return result;
}

function buildVisibleSegments(events: ScheduleEvent[], dayIndex: number, rangeStart: number, rangeEnd: number): Segment[] {
  const segments = events
    .flatMap((event) => segmentsForDay(event, dayIndex))
    .map((segment) => ({
      ...segment,
      start: Math.max(segment.start, rangeStart),
      end: Math.min(segment.end, rangeEnd),
      lane: 0,
      lanes: 1
    }))
    .filter((segment) => segment.end > segment.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const laneEnds: number[] = [];
  segments.forEach((segment) => {
    let lane = laneEnds.findIndex((end) => end <= segment.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(segment.end);
    } else {
      laneEnds[lane] = segment.end;
    }
    segment.lane = lane;
  });

  const laneCount = Math.max(1, laneEnds.length);
  return segments.map((segment) => ({ ...segment, lanes: laneCount }));
}

function getConflicts(candidate: ScheduleEvent, events: ScheduleEvent[]) {
  const conflicts = new Set<string>();
  DAYS.forEach((day, index) => {
    const candidateSegments = segmentsForDay(candidate, index);
    events.filter((event) => event.id !== candidate.id).forEach((other) => {
      segmentsForDay(other, index).forEach((existing) => {
        if (candidateSegments.some((segment) => segment.start < existing.end && existing.start < segment.end)) {
          conflicts.add(`${day.name}: ${other.title} (${fromMinutes(existing.start)}–${fromMinutes(existing.end)})`);
        }
      });
    });
  });
  return [...conflicts];
}

export default function ScheduleCalendar({
  events,
  onChange,
  scheduleView,
  onScheduleViewChange
}: {
  events: ScheduleEvent[];
  onChange: (events: ScheduleEvent[]) => void;
  scheduleView: ScheduleViewRange;
  onScheduleViewChange: (range: ScheduleViewRange) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const viewStart = scheduleView.start;
  const viewEnd = scheduleView.end;
  const scheduled = useMemo(() => events.filter(hasSchedule), [events]);
  const unscheduled = useMemo(() => events.filter((event) => event.courseCode && !hasSchedule(event)), [events]);
  const visibleDays = DAYS.slice(0, scheduleView.lastVisibleDay + 1);
  const viewHeight = ((viewEnd - viewStart) / 60) * HOUR_HEIGHT;
  const printViewHeight = ((viewEnd - viewStart) / 60) * PRINT_HOUR_HEIGHT;
  const timeTicks: number[] = [viewStart];
  for (let minute = (Math.floor(viewStart / 60) + 1) * 60; minute < viewEnd; minute += 60) {
    timeTicks.push(minute);
  }
  const dayEntries = visibleDays.map((day, index) => ({
    day,
    dayIndex: index,
    segments: buildVisibleSegments(events, index, viewStart, viewEnd)
  }));

  const openNew = () => { setMessage(""); setDraft(emptyDraft()); };
  const openEdit = (event: ScheduleEvent) => {
    setMessage("");
    setDraft({ id: event.id, courseCode: event.courseCode || "", title: event.title, days: event.days || [], start: event.start || "08:00", end: event.end || "09:00", color: event.color || "blue" });
  };
  const save = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!draft) return;
    const candidate: ScheduleEvent = {
      id: draft.id || makeId(), ...(draft.courseCode ? { courseCode: draft.courseCode } : {}),
      title: draft.courseCode ? (events.find((event) => event.courseCode === draft.courseCode)?.title || draft.title) : draft.title.trim(),
      kind: draft.courseCode ? "class" : "personal", color: draft.courseCode ? undefined : draft.color,
      days: draft.days, start: draft.start, end: draft.end, location: "", notes: ""
    };
    if (!candidate.title.trim()) { setMessage("Escribe un nombre para la actividad."); return; }
    if (!candidate.days?.length) { setMessage("Selecciona al menos un día."); return; }
    if (!candidate.start || !candidate.end || candidate.start === candidate.end) { setMessage("Indica una hora de inicio y otra de finalización diferentes."); return; }
    const conflicts = getConflicts(candidate, events);
    if (conflicts.length && !window.confirm("Este horario coincide con otra actividad:\n\n" + conflicts.join("\n") + "\n\n¿Deseas guardarlo de todos modos?")) return;
    onChange(events.some((event) => event.id === candidate.id) ? events.map((event) => event.id === candidate.id ? candidate : event) : [...events, candidate]);
    setDraft(null);
  };
  const remove = () => {
    if (!draft || draft.courseCode) return;
    if (!window.confirm("¿Eliminar esta actividad de tu horario semanal?")) return;
    onChange(events.filter((event) => event.id !== draft.id));
    setDraft(null);
  };

  return (
    <section className="schedule-workspace">
      <div className="schedule-intro paper-card">
        <div><span className="eyebrow">ORGANIZACIÓN · TU SEMANA</span><h2>Mi horario semanal</h2><p>Organiza tus clases, estudio, descanso y actividades personales. Los bloques se repiten cada semana en los días seleccionados.</p></div>
        <button className="primary-button" type="button" onClick={openNew}>＋ Añadir actividad</button>
      </div>
      <div className="schedule-view-toolbar">
        <div className="schedule-section-heading">
          <div><h2>Vista de la semana</h2><p>Elige el intervalo de horas que deseas consultar.</p></div>
          <strong>{scheduled.length} bloques{unscheduled.length ? ` · ${unscheduled.length} por organizar` : ""}</strong>
        </div>
        <div className="schedule-view-controls">
          <label>Desde
            <select value={viewStart} onChange={(event) => onScheduleViewChange({ ...scheduleView, start: Number(event.target.value) })}>
              {TIME_OPTIONS.filter((minute) => minute < viewEnd).map((minute) => <option value={minute} key={minute}>{formatClock(minute)}</option>)}
            </select>
          </label>
          <label>Hasta
            <select value={viewEnd} onChange={(event) => onScheduleViewChange({ ...scheduleView, end: Number(event.target.value) })}>
              {TIME_OPTIONS.filter((minute) => minute > viewStart).map((minute) => <option value={minute} key={minute}>{formatClock(minute)}</option>)}
            </select>
          </label>
          <button className="secondary-button" type="button" onClick={() => onScheduleViewChange({ ...scheduleView, start: 0, end: 1440, lastVisibleDay: 6 })} disabled={viewStart === 0 && viewEnd === 1440 && scheduleView.lastVisibleDay === 6}>Mostrar todo</button>
          <button className="primary-button" type="button" onClick={() => window.print()}>Exportar PDF</button>
        </div>
        <div className="schedule-day-controls" role="group" aria-label="Días visibles">
          <strong>Mostrar días</strong>
          {DAYS.map((day, index) => {
            const visible = index <= scheduleView.lastVisibleDay;
            return (
              <label className={visible ? "schedule-day-toggle visible" : "schedule-day-toggle"} key={day.id}>
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={index === 0}
                  onChange={(event) => {
                    const lastVisibleDay = event.target.checked
                      ? Math.max(scheduleView.lastVisibleDay, index)
                      : Math.max(0, index - 1);
                    onScheduleViewChange({ ...scheduleView, lastVisibleDay });
                  }}
                />
                {day.short}
              </label>
            );
          })}
          <small>Al ocultar un día, también se ocultan los días siguientes.</small>
        </div>
      </div>
      <div className="schedule-legend"><span><i className="schedule-legend-dot class-dot" />Clases</span><span><i className="schedule-legend-dot personal-dot" />Actividades personales</span></div>
      {unscheduled.length > 0 && <section className="unscheduled-panel"><h3>Materias en curso por organizar</h3><p>Ya están añadidas a tu horario. Solo falta indicar los días y las horas en que las cursas.</p><div className="unscheduled-list">{unscheduled.map((event) => <div className="unscheduled-row" key={event.id}><div><strong>{event.courseCode} · {event.title}</strong><small>En curso · falta asignar días y horas</small></div><button className="secondary-button" type="button" onClick={() => openEdit(event)}>Elegir días y horas</button></div>)}</div></section>}
      <div className="calendar-shell"><div className="calendar-grid-react" style={{ minWidth: `${62 + visibleDays.length * 112}px`, gridTemplateColumns: `62px repeat(${visibleDays.length}, minmax(112px, 1fr))`, gridTemplateRows: `58px ${viewHeight}px` }}>
        <div className="calendar-corner-react" />
        {dayEntries.map(({ day, segments }) => <div className="calendar-day-head" key={day.id}><strong>{day.name}</strong><small>{segments.length} bloques</small></div>)}
        <div className="calendar-time-axis">{timeTicks.map((minute) => <span key={minute} style={{ top: (minute - viewStart) / 60 * HOUR_HEIGHT }}>{formatAxisMinutes(minute)}</span>)}</div>
        {dayEntries.map(({ day, segments }) => <div className="calendar-day-lane" key={day.id} style={{ height: viewHeight }}>
          {timeTicks.map((minute) => <i className="calendar-hour-line" key={minute} style={{ top: (minute - viewStart) / 60 * HOUR_HEIGHT }} />)}
          {segments.map((segment, segmentIndex) => {
            const color = segment.event.courseCode ? { bg: "#dceeff", border: "#86bce4", text: "#174f78" } : (COLORS.find((item) => item.id === segment.event.color) || COLORS[0]);
            const top = (segment.start - viewStart) / 60 * HOUR_HEIGHT;
            const height = Math.max(18, (segment.end - segment.start) / 60 * HOUR_HEIGHT);
            const width = 100 / segment.lanes, left = segment.lane * width;
            const time = `${formatAxisMinutes(segment.start)}–${formatAxisMinutes(segment.end)}`;
            const continuation = segment.part === "end" ? " · continúa" : segment.part === "start" ? " · continúa mañana" : "";
            return <button key={segment.event.id + segment.part + segmentIndex} type="button" className={segment.event.courseCode ? "calendar-event-react class-event" : "calendar-event-react personal-event"} style={{ top, height, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`, background: color.bg, borderColor: color.border, color: color.text }} onClick={() => openEdit(segment.event)} title={`Editar ${segment.event.title}`}><strong>{segment.event.title}</strong><span>{time}{continuation}</span></button>;
          })}
        </div>)}
      </div></div>
      <div className="schedule-section-heading"><div><h2>Actividades registradas</h2><p>Selecciona un bloque para modificarlo.</p></div></div>
      <section className="schedule-print-report">
        <header className="schedule-print-header">
          <div><span>PLANPLANNERU · INGENIERÍA TELEMÁTICA · ITT-2020</span><h1>Mi horario semanal</h1></div>
          <div><strong>Intervalo visible</strong><span>{formatClock(viewStart)}–{formatClock(viewEnd)}</span><small>Exportado el {new Date().toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" })}</small></div>
        </header>
        <div className="schedule-print-grid" style={{ gridTemplateColumns: `43px repeat(${visibleDays.length}, minmax(0, 1fr))`, gridTemplateRows: `24px ${printViewHeight}px` }}>
          <div className="schedule-print-corner" />
          {dayEntries.map(({ day }) => <div className="schedule-print-day-heading" key={day.id}>{day.name}</div>)}
          <div className="schedule-print-time-axis" style={{ height: printViewHeight }}>
            {timeTicks.map((minute) => <span key={minute} style={{ top: (minute - viewStart) / 60 * PRINT_HOUR_HEIGHT }}>{formatAxisMinutes(minute)}</span>)}
          </div>
          {dayEntries.map(({ day, segments }) => (
            <section className="schedule-print-day" key={day.id} style={{ height: printViewHeight }}>
              {timeTicks.map((minute) => <i className="schedule-print-hour-line" key={minute} style={{ top: (minute - viewStart) / 60 * PRINT_HOUR_HEIGHT }} />)}
              {segments.map((segment, segmentIndex) => {
                const color = segment.event.courseCode ? { bg: "#dceeff", text: "#174f78" } : (COLORS.find((item) => item.id === segment.event.color) || COLORS[0]);
                const top = (segment.start - viewStart) / 60 * PRINT_HOUR_HEIGHT;
                const height = Math.max(7, (segment.end - segment.start) / 60 * PRINT_HOUR_HEIGHT);
                const width = 100 / segment.lanes, left = segment.lane * width;
                const continuation = segment.part === "end" ? " · continúa" : segment.part === "start" ? " · continúa mañana" : "";
                return <article
                  className="schedule-print-event"
                  key={segment.event.id + segment.part + segmentIndex}
                  style={{
                    top,
                    height,
                    left: `calc(${left}% + 1px)`,
                    width: `calc(${width}% - 2px)`,
                    background: color.bg,
                    borderLeftColor: color.text,
                    color: color.text
                  }}
                >
                  <strong>{segment.event.title}</strong>
                  <span>{formatAxisMinutes(segment.start)}–{formatAxisMinutes(segment.end)}{continuation}</span>
                </article>;
              })}
            </section>
          ))}
        </div>
        <footer className="schedule-print-footer">Documento personal generado por PlanPlannerU. No constituye un horario oficial emitido por la PUCMM.</footer>
      </section>

      <div className="schedule-registered-list">{scheduled.length ? scheduled.map((event) => <button type="button" className="schedule-registered-item" key={event.id} onClick={() => openEdit(event)}><span><strong>{event.courseCode ? event.courseCode + " · " : ""}{event.title}</strong><small>{(event.days || []).map((id) => DAYS.find((day) => day.id === id)?.short || id).join(", ")} · {formatStoredClock(event.start)}–{formatStoredClock(event.end)}{toMinutes(event.end) < toMinutes(event.start) ? " (+1 día)" : ""}</small></span><span aria-hidden="true">✎</span></button>) : <p className="empty-message">Todavía no hay bloques con horario asignado.</p>}</div>

      {draft && <div className="schedule-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}>
        <form className="schedule-modal" onSubmit={save} aria-label="Formulario de actividad">
          <div className="schedule-modal-heading"><div><span className="eyebrow">PLANPLANNERU · HORARIO</span><h2>{draft.courseCode ? "Asignar horario de clase" : draft.id ? "Editar actividad" : "Añadir actividad"}</h2><p>{draft.courseCode ? "Selecciona los días y las horas en que cursas esta materia." : "Define el nombre, color, días y horario de tu actividad."}</p></div><button type="button" className="modal-close" onClick={() => setDraft(null)} aria-label="Cerrar">×</button></div>
          {!draft.courseCode && <label className="schedule-field">Nombre de la actividad<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ej. Estudiar, correr, cocinar…" maxLength={70} /></label>}
          {!draft.courseCode && <fieldset className="schedule-color-field"><legend>Color de la actividad</legend><div className="schedule-color-palette">{COLORS.map((color) => <button type="button" key={color.id} className={draft.color === color.id ? "schedule-color-choice selected" : "schedule-color-choice"} onClick={() => setDraft({ ...draft, color: color.id })} aria-label={color.name} title={color.name} style={{ background: color.bg, borderColor: color.border }}><span style={{ background: color.text }} />{color.name}</button>)}</div></fieldset>}
          <fieldset className="schedule-days-field"><legend>Días de la semana</legend><div className="schedule-day-choices">{DAYS.map((day) => <label key={day.id}><input type="checkbox" checked={draft.days.includes(day.id)} onChange={(event) => setDraft({ ...draft, days: event.target.checked ? [...draft.days, day.id] : draft.days.filter((id) => id !== day.id) })} />{day.name}</label>)}</div></fieldset>
          <div className="schedule-time-fields">
            <TimePicker label="Hora de inicio" value={draft.start} onChange={(start) => setDraft({ ...draft, start })} />
            <TimePicker label="Hora de finalización" value={draft.end} onChange={(end) => setDraft({ ...draft, end })} />
          </div>
          {message && <p className="schedule-form-message" role="alert">{message}</p>}
          <div className="schedule-modal-actions">{draft.id && !draft.courseCode && <button type="button" className="schedule-delete-button" onClick={remove}>Eliminar actividad</button>}<span /><button type="button" className="secondary-button" onClick={() => setDraft(null)}>Cancelar</button><button type="submit" className="primary-button">Guardar horario</button></div>
        </form>
      </div>}
    </section>
  );
}


function TimePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const totalMinutes = toMinutes(value);
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const hour12 = hour24 % 12 || 12;
  const minute = totalMinutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";

  const update = (nextHour: number, nextMinute: number, nextPeriod: "AM" | "PM") => {
    const normalizedHour = (nextHour % 12) + (nextPeriod === "PM" ? 12 : 0);
    onChange(`${String(normalizedHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`);
  };

  return (
    <fieldset className="schedule-time-picker">
      <legend>{label}</legend>
      <div className="schedule-time-picker-controls">
        <label>
          <span>Hora</span>
          <select value={hour12} onChange={(event) => update(Number(event.target.value), minute, period)}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => <option value={hour} key={hour}>{hour}</option>)}
          </select>
        </label>
        <label>
          <span>Minutos</span>
          <select value={minute} onChange={(event) => update(hour12, Number(event.target.value), period)}>
            {MINUTE_OPTIONS.map((item) => <option value={item} key={item}>{String(item).padStart(2, "0")}</option>)}
          </select>
        </label>
        <label>
          <span>Período</span>
          <select value={period} onChange={(event) => update(hour12, minute, event.target.value as "AM" | "PM")}>
            <option value="AM">a. m.</option>
            <option value="PM">p. m.</option>
          </select>
        </label>
      </div>
    </fieldset>
  );
}
