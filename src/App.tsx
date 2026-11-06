import { useEffect, useMemo, useRef, useState } from "react";
import planData from "./data/plan.json";
import { EXTERNAL_INFO } from "./data/externalRequirements";
import {
  downloadBackup,
  loadPlannerState,
  readBackup,
  savePlannerState
} from "./lib/storage";
import type {
  Course,
  CourseStatus,
  CurriculumPlan,
  ElectiveGroup,
  Period,
  PlannerState
} from "./types";

const PLAN = planData as CurriculumPlan;
const EXTERNAL_CODES = PLAN.externalRequirements;
const STATUS_ORDER: CourseStatus[] = ["pending", "inprogress", "approved"];
const STATUS_LABEL: Record<CourseStatus, string> = {
  pending: "Pendiente",
  inprogress: "En curso",
  approved: "Aprobada"
};

type Page = "home" | "plan" | "schedule" | "meta" | "requirements";
type Filter = "all" | "pending" | "inprogress" | "approved" | "blocked";

function courseList(): Course[] {
  const all = [...PLAN.periods.flatMap((period) => period.courses), ...PLAN.groups.flatMap((group) => group.options)];
  return Array.from(new Map(all.map((course) => [course.code, course])).values());
}

const ALL_COURSES = courseList();
const COURSE_BY_CODE = new Map(ALL_COURSES.map((course) => [course.code, course]));
const GROUP_BY_ID = new Map(PLAN.groups.map((group) => [group.id, group]));

function getInitialState(): PlannerState {
  return loadPlannerState(EXTERNAL_CODES);
}

function statusOf(state: PlannerState, code: string): CourseStatus {
  return state.courseStates[code] || "pending";
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function approvedCredits(state: PlannerState): number {
  const counted = new Set<string>();
  let total = 0;
  for (const period of PLAN.periods) {
    for (const course of period.courses) {
      if (statusOf(state, course.code) === "approved" && !counted.has(course.code)) {
        counted.add(course.code);
        total += course.credits;
      }
    }
  }
  for (const code of Object.values(state.selections)) {
    const course = COURSE_BY_CODE.get(code);
    if (course && !counted.has(code) && statusOf(state, code) === "approved") {
      counted.add(code);
      total += course.credits;
    }
  }
  return total;
}

function blockersFor(course: Course, state: PlannerState): string[] {
  const blockers: string[] = [];
  for (const requirement of course.req || []) {
    if (COURSE_BY_CODE.has(requirement)) {
      if (statusOf(state, requirement) !== "approved") blockers.push(requirement);
    } else if (!state.externalDone[requirement]) {
      blockers.push(requirement);
    }
  }
  if (course.gate && typeof course.gate === "object") {
    const percent = Number((course.gate as { percent?: number }).percent || 0);
    const needed = Math.ceil(PLAN.totalCredits * percent / 100);
    if (approvedCredits(state) < needed) blockers.push(percent + "% del plan (" + needed + " créditos)");
  }
  return blockers;
}

function periodSummary(period: Period, state: PlannerState) {
  const completed = period.courses.filter((course) => statusOf(state, course.code) === "approved").length;
  const courseCredits = period.courses.reduce((sum, course) => {
    return sum + (statusOf(state, course.code) === "approved" ? course.credits : 0);
  }, 0);
  const groups = period.groups.map((id) => GROUP_BY_ID.get(id)).filter(Boolean) as ElectiveGroup[];
  const completedGroups = groups.filter((group) => {
    const code = state.selections[group.id];
    const selected = code ? COURSE_BY_CODE.get(code) : undefined;
    return !!selected && statusOf(state, code) === "approved" && selected.credits >= group.minCredits;
  }).length;
  const groupCredits = groups.reduce((sum, group) => {
    const code = state.selections[group.id];
    const selected = code ? COURSE_BY_CODE.get(code) : undefined;
    return sum + (selected && statusOf(state, code) === "approved" ? selected.credits : 0);
  }, 0);
  return {
    completed,
    total: period.courses.length,
    groupsCompleted: completedGroups,
    groupsTotal: groups.length,
    credits: courseCredits + groupCredits,
    target: period.baseCredits,
    complete: completed === period.courses.length && completedGroups === groups.length
  };
}

function App() {
  const [planner, setPlanner] = useState<PlannerState>(getInitialState);
  const [page, setPage] = useState<Page>("home");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([planner.meta.currentPeriod || PLAN.periods[0].id]);
  const [toast, setToast] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!savePlannerState(planner)) setToast("No se pudo guardar. Exporta un respaldo para proteger tus cambios.");
  }, [planner]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const approved = useMemo(() => approvedCredits(planner), [planner]);
  const progress = Math.min(100, Math.round((approved / PLAN.totalCredits) * 100));
  const inProgressCount = Object.values(planner.courseStates).filter((value) => value === "inprogress").length;
  const approvedCount = Object.values(planner.courseStates).filter((value) => value === "approved").length;

  const query = normalizeText(search);
  const courseMatches = (course: Course) => {
    if (query && !normalizeText(course.code + " " + course.name).includes(query)) return false;
    const status = statusOf(planner, course.code);
    const blocked = status === "pending" && blockersFor(course, planner).length > 0;
    if (filter === "all") return true;
    if (filter === "pending") return status === "pending" && !blocked;
    if (filter === "inprogress") return status === "inprogress";
    if (filter === "approved") return status === "approved";
    return blocked;
  };

  const persistState = (next: PlannerState) => setPlanner(next);

  const cycleCourse = (course: Course) => {
    const current = statusOf(planner, course.code);
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length];
    const blockers = blockersFor(course, planner);
    if (current === "pending" && next === "inprogress" && blockers.length) {
      const accepted = window.confirm(
        "Esta materia tiene requisitos pendientes: " + blockers.join(", ") +
        ".\n\n¿Deseas marcarla En curso de todos modos? Continúa solamente si tienes autorización o equivalencia válida."
      );
      if (!accepted) return;
    }

    const scheduleEvents = [...planner.scheduleEvents];
    if (next === "inprogress" && !scheduleEvents.some((event) => event.courseCode === course.code)) {
      scheduleEvents.push({
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + course.code),
        courseCode: course.code,
        title: course.name,
        kind: "class",
        days: [],
        start: "",
        end: "",
        location: "",
        notes: ""
      });
    } else if (next !== "inprogress") {
      for (let index = scheduleEvents.length - 1; index >= 0; index -= 1) {
        if (scheduleEvents[index].courseCode === course.code) scheduleEvents.splice(index, 1);
      }
    }

    persistState({
      ...planner,
      courseStates: { ...planner.courseStates, [course.code]: next },
      scheduleEvents
    });
    setToast(course.code + " ahora está: " + STATUS_LABEL[next] + ".");
  };

  const selectElective = (group: ElectiveGroup, code: string) => {
    if (!code) {
      const selections = { ...planner.selections };
      delete selections[group.id];
      if (group.id === "CN-E01-T") delete selections["CN-E01-P"];
      persistState({ ...planner, selections });
      return;
    }
    if (group.uniqueAcross) {
      const alreadyUsed = group.uniqueAcross.some((groupId) => {
        return groupId !== group.id && planner.selections[groupId] === code;
      });
      if (alreadyUsed) {
        setToast("Esta asignatura ya está seleccionada en otra electiva incompatible.");
        return;
      }
    }
    const selections = { ...planner.selections, [group.id]: code };
    const selected = COURSE_BY_CODE.get(code);
    if (group.id === "CN-E01-T" && selected?.lab) selections["CN-E01-P"] = selected.lab;
    persistState({ ...planner, selections });
  };

  const updateExternal = (code: string, checked: boolean) => {
    if (code === "MAT311" || code === "ILE203") return;
    persistState({
      ...planner,
      externalDone: { ...planner.externalDone, [code]: checked }
    });
  };

  const togglePeriod = (id: string) => {
    setExpanded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const visiblePeriods = PLAN.periods.filter((period) => {
    if (!query) return true;
    const periodCourses = [
      ...period.courses,
      ...period.groups.flatMap((id) => GROUP_BY_ID.get(id)?.options || [])
    ];
    return periodCourses.some((course) => normalizeText(course.code + " " + course.name).includes(query));
  });

  const activeCourses = ALL_COURSES.filter((course) => statusOf(planner, course.code) !== "pending").length;

  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await readBackup(file, EXTERNAL_CODES);
      if (!window.confirm("La importación reemplazará el progreso local de este navegador. ¿Continuar?")) return;
      persistState(imported);
      setToast("Respaldo importado correctamente.");
    } catch {
      setToast("No se pudo leer el archivo. Comprueba que sea un respaldo JSON de PlanPlannerU.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const setMeta = (key: string, value: string) => {
    persistState({
      ...planner,
      meta: { ...planner.meta, [key]: value }
    });
  };

  const renderCourse = (course: Course) => {
    const status = statusOf(planner, course.code);
    const blockers = blockersFor(course, planner);
    const isBlocked = status === "pending" && blockers.length > 0;
    const currentIndex = PLAN.periods.findIndex((period) => period.id === planner.meta.currentPeriod);
    const offeredIndex = PLAN.periods.findIndex((period) => period.courses.some((item) => item.code === course.code));
    const lagged = status === "pending" && currentIndex >= 0 && offeredIndex >= 0 && offeredIndex < currentIndex;
    const className = status === "approved" ? "course-card approved" :
      status === "inprogress" ? "course-card inprogress" :
      lagged ? "course-card lagged" :
      isBlocked ? "course-card blocked" : "course-card";
    const buttonLabel = status === "pending" ? "Marcar" : status === "inprogress" ? "Aprobada" : "Desmarcar";

    return (
      <article className={className} key={course.code}>
        <div className="course-head">
          <span className="course-code">{course.code}</span>
          <span className={"status-badge " + (isBlocked ? "blocked" : lagged ? "lagged" : status)}>
            {isBlocked ? "Bloqueada" : lagged ? "Atrasada" : STATUS_LABEL[status]}
          </span>
        </div>
        <h3 className={status === "approved" ? "course-name approved-name" : "course-name"}>{course.name}</h3>
        <div className="course-details">
          <span>{course.credits} créditos</span>
          {course.id && <span>ID {course.id}</span>}
        </div>
        {(course.req?.length || course.additional?.length || blockers.length > 0) > 0 && (
          <div className="requirements">
            {course.req?.length ? <p><strong>Prerrequisitos:</strong> {course.req.join(", ")}</p> : null}
            {course.additional?.length ? <p><strong>Requisitos adicionales:</strong> {course.additional.join(", ")}</p> : null}
            {blockers.length > 0 && <p className="blocker-text"><strong>Por cumplir:</strong> {blockers.join(", ")}</p>}
          </div>
        )}
        <div className="course-actions">
          <button className={"state-button " + status} type="button" onClick={() => cycleCourse(course)}>
            {buttonLabel}
          </button>
        </div>
      </article>
    );
  };

  const renderElective = (group: ElectiveGroup) => {
    const selectedCode = planner.selections[group.id] || "";
    const selected = selectedCode ? COURSE_BY_CODE.get(selectedCode) : undefined;
    const selectedStatus = selected ? statusOf(planner, selected.code) : "pending";
    const done = !!selected && selectedStatus === "approved" && selected.credits >= group.minCredits;
    const options = group.options.filter((course) => {
      if (!query) return true;
      return normalizeText(course.code + " " + course.name).includes(query);
    });

    return (
      <div className="elective-card" key={group.id}>
        <div className="elective-heading">
          <h4>{group.name}</h4>
          <span className={"status-badge " + (done ? "approved" : "pending")}>{done ? "Completada" : "Por completar"}</span>
        </div>
        <label className="field-label" htmlFor={"elective-" + group.id}>Seleccionar asignatura</label>
        <select
          id={"elective-" + group.id}
          value={selectedCode}
          onChange={(event) => selectElective(group, event.target.value)}
        >
          <option value="">Selecciona una electiva…</option>
          {options.map((course) => <option value={course.code} key={course.code}>{course.code} · {course.name} ({course.credits} cr.)</option>)}
        </select>
        {selected && (
          <div className="selected-elective">
            <span>{selected.code} · {selected.name}</span>
            <button className={"state-button " + selectedStatus} type="button" onClick={() => cycleCourse(selected)}>
              {selectedStatus === "pending" ? "Marcar" : selectedStatus === "inprogress" ? "Aprobada" : "Desmarcar"}
            </button>
          </div>
        )}
        <small>Requisito: {group.minCourses} asignatura(s), al menos {group.minCredits} crédito(s).</small>
      </div>
    );
  };

  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="brand" href="#inicio" onClick={() => setPage("home")}>
          <span className="brand-mark">P</span>
          <span><strong>PlanPlannerU</strong><small>Tu cuaderno telemático</small></span>
        </a>
        <nav className="main-nav" aria-label="Navegación principal">
          {([
            ["home", "Resumen"],
            ["plan", "Pensum"],
            ["schedule", "Mi horario"],
            ["requirements", "Requisitos"],
            ["meta", "Mi meta"]
          ] as [Page, string][]).map(([id, label]) => (
            <button key={id} type="button" className={page === id ? "nav-button active" : "nav-button"} onClick={() => setPage(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="cloud-state"><span className="cloud-dot" /> Sincronización: próxima etapa</div>
      </header>

      <main className="content">
        {page === "home" && (
          <>
            <section className="hero-sheet">
              <div>
                <span className="eyebrow">INGENIERÍA TELEMÁTICA · ITT-2020</span>
                <h1>Tu carrera, organizada en un solo lugar.</h1>
                <p>Planifica tus períodos, registra tus asignaturas y observa cómo avanzas hacia la meta de 212 créditos.</p>
                <button className="primary-button" type="button" onClick={() => setPage("plan")}>Abrir mi pensum</button>
              </div>
              <div className="hero-note"><span>Mi progreso</span><strong>{progress}%</strong><small>{approved} de {PLAN.totalCredits} créditos</small></div>
            </section>
            <section className="stats-grid">
              <Stat label="Créditos aprobados" value={approved + " / " + PLAN.totalCredits} detail="Incluye electivas seleccionadas" />
              <Stat label="Asignaturas en curso" value={String(inProgressCount)} detail="Pendientes de aprobación" />
              <Stat label="Asignaturas aprobadas" value={String(approvedCount)} detail="Según tu registro actual" />
              <Stat label="Plan académico" value={String(PLAN.periods.length) + " períodos"} detail={String(ALL_COURSES.length) + " asignaturas y opciones" />
            </section>
            <section className="progress-panel">
              <div className="panel-heading"><div><span className="eyebrow">RECORRIDO ACADÉMICO</span><h2>Progreso de la carrera</h2></div><strong>{progress}%</strong></div>
              <div className="progress-track"><div className="progress-fill" style={{ width: progress + "%" }} /></div>
              <div className="progress-caption"><span>{approved} créditos completados</span><span>{PLAN.totalCredits - approved} por completar</span></div>
            </section>
            <section className="two-column">
              <div className="paper-card">
                <span className="eyebrow">CONTINÚA DONDE TE QUEDASTE</span>
                <h2>Tu plan académico</h2>
                <p>Las asignaturas aprobadas, en curso y pendientes se conservan en el almacenamiento de este navegador.</p>
                <button className="secondary-button" type="button" onClick={() => setPage("plan")}>Ver asignaturas</button>
              </div>
              <div className="paper-card">
                <span className="eyebrow">RESPALDOS</span>
                <h2>Protege tu progreso</h2>
                <p>Exporta un archivo JSON para conservar una copia y trasladarla a otro navegador.</p>
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={() => downloadBackup(planner)}>Exportar respaldo</button>
                  <button className="secondary-button" type="button" onClick={() => importRef.current?.click()}>Importar respaldo</button>
                  <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => handleImport(event.target.files?.[0])} />
                </div>
              </div>
            </section>
            <p className="migration-note">Esta es la primera etapa de la migración React. El calendario editable, las actividades personales, el asesor académico y la sincronización se incorporarán gradualmente. La versión anterior se conserva como respaldo.</p>
            <a className="legacy-link" href="./legacy/index.html" target="_blank" rel="noreferrer">Abrir la versión anterior completa ↗</a>
          </>
        )}

        {page === "plan" && (
          <>
            <PageHeading eyebrow="DESARROLLO" title="Pensum ITT-2020" description="Consulta tus asignaturas, registra su estado y elige las electivas correspondientes." />
            <div className="plan-toolbar">
              <input className="search-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o nombre…" aria-label="Buscar asignatura" />
              <div className="filter-row">
                {([
                  ["all", "Todas"],
                  ["pending", "Disponibles"],
                  ["inprogress", "En curso"],
                  ["approved", "Aprobadas"],
                  ["blocked", "Bloqueadas"]
                ] as [Filter, string][]).map(([id, label]) => (
                  <button key={id} type="button" className={filter === id ? "filter-button active" : "filter-button"} onClick={() => setFilter(id)}>{label}</button>
                ))}
              </div>
            </div>
            {visiblePeriods.map((period) => {
              const summary = periodSummary(period, planner);
              const isOpen = expanded.includes(period.id) || !!query;
              const courses = period.courses.filter(courseMatches);
              const groups = period.groups.map((id) => GROUP_BY_ID.get(id)).filter(Boolean) as ElectiveGroup[];
              const electiveGroups = groups.map((group) => (
                <div className="course-grid" key={group.id}>{renderElective(group)}</div>
              ));
              if (query && !courses.length && !groups.some((group) => group.options.some((course) => normalizeText(course.code + " " + course.name).includes(query)))) return null;
              return (
                <details className={summary.complete ? "period-card complete" : "period-card"} key={period.id} open={isOpen} onToggle={(event) => {
                  if ((event.currentTarget as HTMLDetailsElement).open) {
                    setExpanded((current) => current.includes(period.id) ? current : [...current, period.id]);
                  }
                }}>
                  <summary className="period-summary">
                    <span><strong>{period.label}</strong><small>{summary.completed}/{summary.total} cursos obligatorios · {summary.groupsCompleted}/{summary.groupsTotal} electivas</small></span>
                    <span className="period-progress">{summary.credits} / {summary.target} cr.</span>
                  </summary>
                  <div className="period-body">
                    {courses.length ? <div className="course-grid">{courses.map(renderCourse)}</div> : <p className="empty-message">No hay asignaturas que coincidan con este filtro.</p>}
                    {groups.length > 0 && <div className="elective-section"><h3>Electivas de este período</h3>{electiveGroups}</div>}
                  </div>
                </details>
              );
            })}
            <p className="footnote">Los prerrequisitos externos ICC133, ILE311, ILE322, ITT102, 1ITT102 y MAT134 se mantienen como códigos independientes hasta confirmar su equivalencia.</p>
          </>
        )}

        {page === "schedule" && (
          <>
            <PageHeading eyebrow="ORGANIZACIÓN" title="Mi horario" description="Las materias marcadas En curso aparecen aquí como pendientes de asignar." />
            <div className="paper-card">
              <div className="panel-heading"><div><h2>Materias en curso</h2><p>Se conservan los bloques existentes en tu archivo local.</p></div><span className="status-badge inprogress">{planner.scheduleEvents.length} elementos</span></div>
              {planner.scheduleEvents.length ? (
                <div className="schedule-list">
                  {planner.scheduleEvents.map((event) => (
                    <article className="schedule-card" key={event.id}>
                      <strong>{event.courseCode || "Actividad personal"}</strong>
                      <span>{event.title}</span>
                      <small>{event.days?.length ? event.days.join(", ") : "Días pendientes"} · {event.start && event.end ? event.start + "–" + event.end : "Horario pendiente"}</small>
                    </article>
                  ))}
                </div>
              ) : <p className="empty-message">Todavía no hay materias o actividades registradas en tu horario.</p>}
              <div className="notice-panel">La edición completa del calendario semanal y las actividades personales se trasladará en la siguiente fase de migración. Mientras tanto, puedes abrir la versión anterior para gestionarlos.</div>
              <a className="legacy-link" href="./legacy/index.html" target="_blank" rel="noreferrer">Abrir horario en la versión anterior ↗</a>
            </div>
          </>
        )}

        {page === "requirements" && (
          <>
            <PageHeading eyebrow="REVISIÓN ACADÉMICA" title="Requisitos externos" description="MAT311 e ILE203 están reconocidos como cumplidos por tu examen de admisión. Los demás códigos requieren confirmación." />
            <div className="requirements-list">
              {EXTERNAL_CODES.map((code) => {
                const info = EXTERNAL_INFO[code];
                const automatic = info?.auto || code === "MAT311" || code === "ILE203";
                const checked = automatic || !!planner.externalDone[code];
                return (
                  <label className={"external-row " + (checked ? "is-done" : "")} key={code}>
                    <input type="checkbox" checked={checked} disabled={automatic} onChange={(event) => updateExternal(code, event.target.checked)} />
                    <span className="external-copy"><strong>{code}</strong><small>{info?.title || "Requisito externo"}. {info?.detail || "El plan no incluye más información sobre este código."}</small></span>
                    <span className="external-state">{automatic ? "Cumplido por admisión" : checked ? "Cumplido" : "Por confirmar"}</span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        {page === "meta" && (
          <>
            <PageHeading eyebrow="OBJETIVO FINAL" title="Mi meta académica" description="Registra tu situación actual para estimar tu avance hacia la graduación." />
            <div className="meta-grid">
              <section className="paper-card">
                <h2>Tu situación actual</h2>
                <label className="form-field">Período actual
                  <select value={planner.meta.currentPeriod} onChange={(event) => setMeta("currentPeriod", event.target.value)}>
                    <option value="">Selecciona tu período…</option>
                    {PLAN.periods.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
                  </select>
                </label>
                <label className="form-field">Carga académica estimada por período
                  <input type="number" min="1" max="30" value={planner.meta.loadPerTerm} onChange={(event) => setMeta("loadPerTerm", event.target.value)} />
                </label>
                <label className="form-field">Índice académico acumulado
                  <input type="number" min="0" max="4" step="0.01" value={planner.meta.gpa} onChange={(event) => setMeta("gpa", event.target.value)} placeholder="Ej. 3.50" />
                </label>
                <label className="form-field">Horas de pasantía completadas
                  <input type="number" min="0" max="320" value={planner.meta.internship} onChange={(event) => setMeta("internship", event.target.value)} />
                </label>
              </section>
              <section className="paper-card">
                <h2>Requisitos de graduación</h2>
                <div className="graduation-check"><span className={approved >= PLAN.totalCredits ? "check done" : "check"}>✓</span><span>Completar {PLAN.totalCredits} créditos ({approved}/{PLAN.totalCredits}).</span></div>
                <div className="graduation-check"><span className={Number(planner.meta.gpa) >= 2 ? "check done" : "check"}>✓</span><span>Índice acumulado mínimo de 2.00.</span></div>
                <div className="graduation-check"><span className={approved >= Math.ceil(PLAN.totalCredits * .75) ? "check done" : "check"}>✓</span><span>Alcanzar el 75 % del plan ({Math.ceil(PLAN.totalCredits * .75)} créditos).</span></div>
                <div className="graduation-check"><span className={approved >= Math.ceil(PLAN.totalCredits * .75) && Number(planner.meta.internship) >= 320 ? "check done" : "check"}>✓</span><span>Completar 320 horas de pasantía después del 75 %.</span></div>
                <div className="progress-track"><div className="progress-fill" style={{ width: Math.min(100, Number(planner.meta.internship) / 320 * 100) + "%" }} /></div>
                <small>{planner.meta.internship}/320 horas registradas.</small>
              </section>
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        <span>PlanPlannerU · ITT-2020</span>
        <span>Progreso local · {activeCourses} asignaturas iniciadas o completadas</span>
      </footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="stat-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>;
}

export default App;
