import { useEffect, useMemo, useRef, useState } from "react";
import planData from "./data/plan.json";
import AcademicIndex from "./components/AcademicIndex";
import AcademicAdvisor from "./components/AcademicAdvisor";
import { calculateGraduationProjection, normalizeCreditsPerTerm } from "./lib/graduationProjection";
import ScheduleCalendar from "./components/ScheduleCalendar";
import { EXTERNAL_INFO } from "./data/externalRequirements";
import { buildAcademicAdvice } from "./lib/academicAdvisor";
import {
  downloadBackup,
  loadPlannerState,
  readBackup,
  savePlannerState
} from "./lib/storage";
import type {
  AdvisorCourseProfile,
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

type Page = "home" | "plan" | "schedule" | "meta" | "requirements" | "index";
const NAVIGATION_STORAGE_KEY = "planplanneru_last_page_v1";
const VALID_PAGES: Page[] = ["home", "plan", "schedule", "meta", "requirements", "index"];

function getInitialPage(): Page {
  try {
    const savedPage = localStorage.getItem(NAVIGATION_STORAGE_KEY);
    return savedPage && VALID_PAGES.includes(savedPage as Page)
      ? (savedPage as Page)
      : "home";
  } catch (error) {
    console.warn("No se pudo recuperar la última sección de PlanPlannerU.", error);
    return "home";
  }
}

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

function normalizeSearchText(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function courseSearchText(course: Course): string {
  return [course.code, course.name, course.id || ""].join(" ");
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
  const [page, setPage] = useState<Page>(getInitialPage);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([planner.meta.currentPeriod || PLAN.periods[0].id]);
  const [toast, setToast] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!savePlannerState(planner)) setToast("No se pudo guardar. Exporta un respaldo para proteger tus cambios.");
  }, [planner]);

  useEffect(() => {
    try {
      localStorage.setItem(NAVIGATION_STORAGE_KEY, page);
    } catch (error) {
      console.warn("No se pudo guardar la última sección de PlanPlannerU.", error);
    }
  }, [page]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const approved = useMemo(() => approvedCredits(planner), [planner]);
  const progress = Math.min(100, Math.round((approved / PLAN.totalCredits) * 100));
  const inProgressCount = Object.values(planner.courseStates).filter((value) => value === "inprogress").length;
  const approvedCount = Object.values(planner.courseStates).filter((value) => value === "approved").length;

  const query = normalizeSearchText(search);
  const queryTerms = query ? query.split(/\s+/).filter(Boolean) : [];
  const exactCodeMatch =
    queryTerms.length === 1 ? COURSE_BY_CODE.get(search.trim().toUpperCase()) : undefined;
  const matchesAllSearchTerms = (value: string) => {
    const searchableText = normalizeSearchText(value);
    return queryTerms.every((term) => searchableText.includes(term));
  };
  const courseMatchesSearch = (course: Course) => {
    if (queryTerms.length === 0) return true;
    if (exactCodeMatch) return course.code === exactCodeMatch.code;
    return matchesAllSearchTerms(courseSearchText(course));
  };
  const courseMatchesStatus = (course: Course) => {
    const status = statusOf(planner, course.code);
    const blocked = status === "pending" && blockersFor(course, planner).length > 0;
    if (filter === "all") return true;
    if (filter === "pending") return status === "pending" && !blocked;
    if (filter === "inprogress") return status === "inprogress";
    if (filter === "approved") return status === "approved";
    return blocked;
  };
  const courseMatches = (course: Course) =>
    courseMatchesSearch(course) && courseMatchesStatus(course);
  const hasActiveCatalogFilters = queryTerms.length > 0 || filter !== "all";

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

  const togglePeriod = (id: string, open: boolean) => {
    setExpanded((current) => {
      if (open) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((item) => item !== id);
    });
  };

  const visiblePeriods = PLAN.periods.map((period) => {
    const courses = period.courses.filter(courseMatches);
    const groups = period.groups
      .map((id) => GROUP_BY_ID.get(id))
      .filter((group): group is ElectiveGroup => Boolean(group))
      .map((group) => {
        const options = group.options.filter((course) =>
          courseMatchesSearch(course) && courseMatchesStatus(course)
        );
        return { group, options };
      })
      .filter((entry) => entry.options.length > 0);

    return { period, courses, groups };
  }).filter((entry) =>
    !hasActiveCatalogFilters || entry.courses.length > 0 || entry.groups.length > 0
  );
  const searchResultCount = visiblePeriods.reduce((total, entry) =>
    total + entry.courses.length + entry.groups.reduce((groupTotal, group) => groupTotal + group.options.length, 0), 0
  );

  const activeCourses = ALL_COURSES.filter((course) => statusOf(planner, course.code) !== "pending").length;

  const academicAdvice = useMemo(() => buildAcademicAdvice(PLAN, planner), [planner]);
  const graduationProjection = useMemo(() => calculateGraduationProjection(PLAN, planner), [planner]);

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

  const updateAdvisorCourseProfile = (
    courseCode: string,
    patch: Partial<AdvisorCourseProfile>
  ) => {
    const advisorCourseProfiles = { ...(planner.advisorCourseProfiles || {}) };
    const current = advisorCourseProfiles[courseCode] || {};
    const updated: AdvisorCourseProfile = { ...current, ...patch };

    for (const key of Object.keys(patch) as (keyof AdvisorCourseProfile)[]) {
      if (patch[key] === undefined) delete updated[key];
    }

    if (Object.keys(updated).length > 0) {
      advisorCourseProfiles[courseCode] = updated;
    } else {
      delete advisorCourseProfiles[courseCode];
    }

    persistState({ ...planner, advisorCourseProfiles });
  };

  const openAdvisorCourse = (courseCode: string) => {
    const period = PLAN.periods.find((item) =>
      item.courses.some((course) => course.code === courseCode) ||
      item.groups.some((groupId) => GROUP_BY_ID.get(groupId)?.options.some((course) => course.code === courseCode))
    );
    if (period) setExpanded([period.id]);
    setFilter("all");
    setSearch(courseCode);
    setPage("plan");
  };

  const setMeta = (key: string, value: string) => {
    let normalizedValue = value;

    if (key === "internship") {
      const hours = value.trim() === "" ? 0 : Number(value);
      if (Number.isFinite(hours)) {
        normalizedValue = String(Math.floor(Math.min(320, Math.max(0, hours))));
      }
    } else if (key === "loadPerTerm") {
      normalizedValue = String(normalizeCreditsPerTerm(value));
    } else if (key === "gpa") {
      const number = value.trim() === "" ? null : Number(value);
      if (number !== null && Number.isFinite(number)) {
        normalizedValue = String(Math.min(4, Math.max(0, number)));
      }
    }

    persistState({
      ...planner,
      meta: { ...planner.meta, [key]: normalizedValue }
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
        {Boolean(course.req?.length || course.additional?.length || blockers.length) && (
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

  const renderElective = (group: ElectiveGroup, matchingOptions: Course[]) => {
    const selectedCode = planner.selections[group.id] || "";
    const selected = selectedCode ? COURSE_BY_CODE.get(selectedCode) : undefined;
    const selectedStatus = selected ? statusOf(planner, selected.code) : "pending";
    const done = !!selected && selectedStatus === "approved" && selected.credits >= group.minCredits;
    const selectedOutsideMatches = !!selected && !matchingOptions.some((course) => course.code === selected.code);

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
          {selected && selectedOutsideMatches && (
            <optgroup label="Selección actual">
              <option value={selected.code}>{selected.code} · {selected.name} (seleccionada)</option>
            </optgroup>
          )}
          {matchingOptions.length > 0 && (
            <optgroup label={query ? "Coincidencias" : "Opciones disponibles"}>
              {matchingOptions.map((course) => <option value={course.code} key={course.code}>{course.code} · {course.name} ({course.credits} cr.)</option>)}
            </optgroup>
          )}
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
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="img" focusable="false">
              <rect x="10" y="8" width="36" height="46" rx="5" fill="#fffdf7" stroke="#d9e1e3" strokeWidth="2" />
              <path d="M18 20h19M18 28h13M18 36h10" stroke="#b8cbd3" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M37 14l12 12-20 20-8 2 2-8z" fill="#d6e4eb" stroke="#29465c" strokeWidth="2.5" strokeLinejoin="round" />
              <path d="M21 48l8-2-6-6z" fill="#d5a16f" />
              <path d="M37 14l4-4a4 4 0 0 1 6 0l4 4a4 4 0 0 1 0 6l-4 4z" fill="#fff" stroke="#29465c" strokeWidth="2.5" />
            </svg>
          </span>
          <span><strong>PlanPlannerU</strong><small>Tu cuaderno telemático</small></span>
        </a>
        <nav className="main-nav" aria-label="Navegación principal">
          {([
            ["home", "Resumen"],
            ["plan", "Pensum"],
            ["schedule", "Mi horario"],
            ["requirements", "Requisitos"],
            ["meta", "Mi meta"],
            ["index", "Mi índice"]
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
              <Stat label="Plan académico" value={String(PLAN.periods.length) + " períodos"} detail={String(ALL_COURSES.length) + " asignaturas y opciones"} />
            </section>
            <section className="progress-panel">
              <div className="panel-heading"><div><span className="eyebrow">RECORRIDO ACADÉMICO</span><h2>Progreso de la carrera</h2></div><strong>{progress}%</strong></div>
              <div className="progress-track"><div className="progress-fill" style={{ width: progress + "%" }} /></div>
              <div className="progress-caption"><span>{approved} créditos completados</span><span>{PLAN.totalCredits - approved} por completar</span></div>
            </section>
            <AcademicAdvisor
              {...academicAdvice}
              onOpenCourse={openAdvisorCourse}
              onConfigurePeriod={() => setPage("meta")}
              onProfileChange={updateAdvisorCourseProfile}
            />
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
            <p className="migration-note">PlanPlannerU continúa en migración. El pensum, el horario semanal y el cálculo del índice ya están disponibles en esta versión; la sincronización y otras funciones complementarias se incorporarán gradualmente. La versión anterior se conserva como referencia.</p>
            <a className="legacy-link" href="./legacy/index.html" target="_blank" rel="noreferrer">Abrir la versión anterior completa ↗</a>
          </>
        )}

        {page === "plan" && (
          <>
            <PageHeading eyebrow="DESARROLLO" title="Pensum ITT-2020" description="Consulta tus asignaturas, registra su estado y elige las electivas correspondientes." />
            <div className="plan-toolbar">
              <div className="plan-search-group">
                <label htmlFor="pensum-search">Buscar en todo el pensum</label>
                <div className="plan-search-control">
                  <span className="plan-search-icon" aria-hidden="true">⌕</span>
                  <input
                    id="pensum-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Código, nombre, ID, prerrequisito o electiva…"
                    aria-label="Buscar en todo el pensum"
                    autoComplete="off"
                  />
                  {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpiar búsqueda">×</button>}
                </div>
                <small>Admite varias palabras y no distingue mayúsculas ni tildes.</small>
              </div>
              <div className="plan-filter-group">
                <span className="plan-filter-label">Filtrar por estado</span>
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
            </div>
            {hasActiveCatalogFilters && (
              <p className="plan-results-summary" aria-live="polite">
                <strong>{searchResultCount}</strong> {searchResultCount === 1 ? "resultado encontrado" : "resultados encontrados"}
                {query ? ` para “${search}”` : ""}
                {filter !== "all" ? ` · Filtro: ${filter === "pending" ? "Disponibles" : filter === "inprogress" ? "En curso" : filter === "approved" ? "Aprobadas" : "Bloqueadas"}` : ""}
              </p>
            )}
            {visiblePeriods.length > 0 ? visiblePeriods.map(({ period, courses, groups }) => {
              const summary = periodSummary(period, planner);
              const isOpen = expanded.includes(period.id) || hasActiveCatalogFilters;
              const electiveGroups = groups.map(({ group, options }) => (
                <div className="course-grid" key={group.id}>{renderElective(group, options)}</div>
              ));
              return (
                <details className={summary.complete ? "period-card complete" : "period-card"} key={period.id} open={isOpen} onToggle={(event) => {
                  togglePeriod(period.id, (event.currentTarget as HTMLDetailsElement).open);
                }}>
                  <summary className="period-summary">
                    <span><strong>{period.label}</strong><small>{summary.completed}/{summary.total} cursos obligatorios · {summary.groupsCompleted}/{summary.groupsTotal} electivas</small></span>
                    <span className="period-progress">{summary.credits} / {summary.target} cr.</span>
                  </summary>
                  <div className="period-body">
                    {courses.length > 0 && <div className="course-grid">{courses.map(renderCourse)}</div>}
                    {groups.length > 0 && <div className="elective-section"><h3>Electivas de este período</h3>{electiveGroups}</div>}
                  </div>
                </details>
              );
            }) : (
              <section className="plan-no-results">
                <span aria-hidden="true">⌕</span>
                <h2>No encontramos coincidencias</h2>
                <p>Prueba con el código, el nombre, el identificador, un prerrequisito o el nombre de un grupo electivo. También puedes cambiar el filtro de estado.</p>
                <button type="button" className="secondary-button" onClick={() => { setSearch(""); setFilter("all"); }}>
                  Limpiar búsqueda y filtros
                </button>
              </section>
            )}
            <p className="footnote">Los prerrequisitos externos ICC133, ILE311, ILE322, ITT102, 1ITT102 y MAT134 se mantienen como códigos independientes hasta confirmar su equivalencia.</p>
          </>
        )}

        {page === "schedule" && (
          <>
            <PageHeading eyebrow="ORGANIZACIÓN" title="Mi horario" description="Organiza tus clases y actividades personales en una vista semanal editable." />
            <ScheduleCalendar
              events={planner.scheduleEvents}
              onChange={(scheduleEvents) => persistState({ ...planner, scheduleEvents })}
              scheduleView={planner.scheduleView}
              onScheduleViewChange={(scheduleView) => persistState({ ...planner, scheduleView })}
              onReset={(scheduleEvents, scheduleView) => persistState({ ...planner, scheduleEvents, scheduleView })}
            />
          </>
        )}

        {page === "index" && (
          <AcademicIndex
            periods={PLAN.periods}
            groups={PLAN.groups}
            courses={ALL_COURSES}
            selections={planner.selections}
            gradeAttempts={planner.gradeAttempts}
            onGradeAttemptsChange={(gradeAttempts) => persistState({ ...planner, gradeAttempts })}
          />
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
                  <select
                    className="academic-load-select"
                    value={String(normalizeCreditsPerTerm(planner.meta.loadPerTerm))}
                    onChange={(event) => setMeta("loadPerTerm", event.target.value)}
                  >
                    <optgroup label="Carga regular · hasta 22 créditos">
                      {Array.from({ length: 22 }, (_, index) => index + 1).map((credits) => (
                        <option value={String(credits)} key={credits}>{credits} créditos</option>
                      ))}
                    </optgroup>
                    <optgroup label="Carga ampliada · requiere autorización">
                      {Array.from({ length: 8 }, (_, index) => index + 23).map((credits) => (
                        <option value={String(credits)} key={credits}>{credits} créditos</option>
                      ))}
                    </optgroup>
                  </select>
                  <small>Selecciona entre 1 y 22 créditos para una carga regular. De 23 a 30, utiliza únicamente la carga ampliada cuando tengas la autorización correspondiente.</small>
                </label>
                <label className="form-field">Índice académico acumulado
                  <input type="number" min="0" max="4" step="0.1" value={planner.meta.gpa} onChange={(event) => setMeta("gpa", event.target.value)} placeholder="Ej. 3.5" />
                </label>
                <label className="form-field">Horas de pasantía completadas
                  <input type="number" min="0" max="320" value={planner.meta.internship} onChange={(event) => setMeta("internship", event.target.value)} />
                </label>
              </section>
              <section className="paper-card">
                <h2>Requisitos de graduación</h2>
                <div className="graduation-check"><span className={approved >= PLAN.totalCredits ? "check done" : "check"}>✓</span><span>Completar {PLAN.totalCredits} créditos ({approved}/{PLAN.totalCredits}).</span></div>
                <div className="graduation-check"><span className={Number(planner.meta.gpa) >= 2 ? "check done" : "check"}>✓</span><span>Índice acumulado mínimo de 2.0.</span></div>
                <div className="graduation-check"><span className={approved >= Math.ceil(PLAN.totalCredits * .75) ? "check done" : "check"}>✓</span><span>Alcanzar el 75 % del plan ({Math.ceil(PLAN.totalCredits * .75)} créditos).</span></div>
                <div className="graduation-check"><span className={approved >= Math.ceil(PLAN.totalCredits * .75) && Number(planner.meta.internship) >= 320 ? "check done" : "check"}>✓</span><span>Completar 320 horas de pasantía después del 75 %.</span></div>
                <div className="progress-track"><div className="progress-fill" style={{ width: Math.min(100, Number(planner.meta.internship) / 320 * 100) + "%" }} /></div>
                <small>{planner.meta.internship}/320 horas registradas.</small>
              </section>
            </div>
            <section className="paper-card graduation-projection">
              <span className="eyebrow">ESCENARIO ORIENTATIVO</span>
              <h2>Proyección de finalización</h2>
              {graduationProjection.status === "needs-period" && (
                <p>Selecciona tu período académico actual para estimar en qué período podrías completar el plan.</p>
              )}
              {graduationProjection.status === "complete" && (
                <p>Has registrado los {PLAN.totalCredits} créditos del pensum. Revisa también tu índice académico y los requisitos de pasantía.</p>
              )}
              {graduationProjection.status === "projected" && (
                <>
                  <p><strong>{graduationProjection.periodsRemaining} {graduationProjection.periodsRemaining === 1 ? "período estimado restante" : "períodos estimados restantes"}</strong></p>
                  <p>Final estimado: <strong>Año {graduationProjection.finishYear} · Período {graduationProjection.finishTerm}</strong>.</p>
                  <p>{graduationProjection.remainingCredits} créditos pendientes, calculados a un ritmo de {graduationProjection.creditsPerTerm} créditos por período.</p>
                  {graduationProjection.exceedsPlan && (
                    <p className="blocker-text">Este escenario supera los 12 períodos incluidos en el pensum base.</p>
                  )}
                </>
              )}
              <small>Es una estimación matemática basada en los créditos pendientes y tu carga prevista. No garantiza que todas las asignaturas estén disponibles ni que se cumplan sus prerrequisitos.</small>
            </section>
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
