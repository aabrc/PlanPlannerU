import { useEffect, useMemo, useState } from "react";
import type { Course, ElectiveGroup, GradeAttempt, Period } from "../types";
import {
  calculateAcademicIndex,
  letterForGrade,
  qualityPointsForGrade
} from "../lib/academicIndex";

interface AcademicIndexProps {
  periods: Period[];
  groups: ElectiveGroup[];
  courses: Course[];
  selections: Record<string, string>;
  gradeAttempts: GradeAttempt[];
  onGradeAttemptsChange: (attempts: GradeAttempt[]) => void;
}

function attemptKey(periodId: string, courseCode: string): string {
  return periodId + "::" + courseCode;
}

function AcademicIndex({
  periods,
  groups,
  courses,
  selections,
  gradeAttempts,
  onGradeAttemptsChange
}: AcademicIndexProps) {
  const [mode, setMode] = useState<"period" | "cumulative">("period");
  const [periodId, setPeriodId] = useState(periods[0]?.id || "");
  const [additionalCodes, setAdditionalCodes] = useState<Record<string, string[]>>({});
  const [selectedCode, setSelectedCode] = useState("");
  const [draftGrades, setDraftGrades] = useState<Record<string, string>>(() => {
    return Object.fromEntries(
      gradeAttempts.map((attempt) => [
        attemptKey(attempt.periodId, attempt.courseCode),
        String(attempt.grade)
      ])
    );
  });
  const [feedback, setFeedback] = useState("");

  const courseByCode = useMemo(
    () => new Map(courses.map((course) => [course.code, course])),
    [courses]
  );
  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups]
  );
  const selectedPeriod = periods.find((period) => period.id === periodId) || periods[0];

  useEffect(() => {
    const savedForPeriod = gradeAttempts.filter((attempt) => attempt.periodId === periodId);
    setDraftGrades((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (key.startsWith(periodId + "::")) delete next[key];
      }
      for (const attempt of savedForPeriod) {
        next[attemptKey(periodId, attempt.courseCode)] = String(attempt.grade);
      }
      return next;
    });
    setSelectedCode("");
  }, [periodId]);

  const periodCourses = useMemo(() => {
    if (!selectedPeriod) return [];
    const selectedElectives = selectedPeriod.groups
      .map((groupId) => {
        const group = groupById.get(groupId);
        const code = selections[groupId];
        return group && code ? courseByCode.get(code) : undefined;
      })
      .filter((course): course is Course => !!course);

    const previouslyRecorded = gradeAttempts
      .filter((attempt) => attempt.periodId === selectedPeriod.id)
      .map((attempt) => courseByCode.get(attempt.courseCode))
      .filter((course): course is Course => !!course);

    const manuallyAdded = (additionalCodes[selectedPeriod.id] || [])
      .map((code) => courseByCode.get(code))
      .filter((course): course is Course => !!course);

    const unique = new Map(
      [...selectedPeriod.courses, ...selectedElectives, ...previouslyRecorded, ...manuallyAdded]
        .map((course) => [course.code, course])
    );
    return Array.from(unique.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [selectedPeriod, groupById, selections, courseByCode, gradeAttempts, additionalCodes]);

  const periodResult = calculateAcademicIndex(
    gradeAttempts,
    courses,
    periods,
    "period",
    periodId
  );
  const cumulativeResult = calculateAcademicIndex(
    gradeAttempts,
    courses,
    periods,
    "cumulative"
  );
  const activeResult = mode === "period" ? periodResult : cumulativeResult;

  const availableCourses = courses
    .filter((course) => !periodCourses.some((periodCourse) => periodCourse.code === course.code))
    .sort((a, b) => a.code.localeCompare(b.code));

  const addCourseToPeriod = () => {
    if (!selectedCode || !selectedPeriod) return;
    setAdditionalCodes((current) => ({
      ...current,
      [selectedPeriod.id]: Array.from(new Set([
        ...(current[selectedPeriod.id] || []),
        selectedCode
      ]))
    }));
    setSelectedCode("");
  };

  const saveGrade = (course: Course) => {
    const key = attemptKey(periodId, course.code);
    const rawGrade = draftGrades[key] ?? "";
    const grade = Number(rawGrade);
    if (rawGrade.trim() === "" || !Number.isFinite(grade) || grade < 0 || grade > 100) {
      setFeedback("Introduce una calificación entre 0 y 100.");
      return;
    }

    const existing = gradeAttempts.find(
      (attempt) => attempt.periodId === periodId && attempt.courseCode === course.code
    );
    const updatedAttempt: GradeAttempt = {
      id: existing?.id || key,
      courseCode: course.code,
      periodId,
      grade,
      createdAt: Date.now()
    };
    onGradeAttemptsChange([
      ...gradeAttempts.filter(
        (attempt) => !(attempt.periodId === periodId && attempt.courseCode === course.code)
      ),
      updatedAttempt
    ]);
    setFeedback("Calificación de " + course.code + " guardada.");
  };

  const removeGrade = (course: Course) => {
    const key = attemptKey(periodId, course.code);
    onGradeAttemptsChange(
      gradeAttempts.filter(
        (attempt) => !(attempt.periodId === periodId && attempt.courseCode === course.code)
      )
    );
    setDraftGrades((current) => ({ ...current, [key]: "" }));
    setFeedback("Calificación de " + course.code + " eliminada.");
  };

  const orderedCumulativeAttempts = [...cumulativeResult.attempts].sort((a, b) => {
    const courseA = courseByCode.get(a.courseCode)?.name || a.courseCode;
    const courseB = courseByCode.get(b.courseCode)?.name || b.courseCode;
    return courseA.localeCompare(courseB);
  });

  return (
    <>
      <header className="page-heading">
        <span className="eyebrow">REGISTRO DE CALIFICACIONES</span>
        <h1>Mi índice académico</h1>
        <p>Registra las notas de tus asignaturas. PlanPlannerU calculará el índice del período o el acumulado usando los créditos del pensum.</p>
      </header>

      <section className="index-guide" aria-labelledby="index-guide-title">
        <div className="index-guide-heading">
          <span className="index-guide-icon" aria-hidden="true">✎</span>
          <div>
            <span className="eyebrow">GUÍA RÁPIDA</span>
            <h2 id="index-guide-title">¿Cómo utilizar Mi índice?</h2>
            <p>Este apartado convierte tus calificaciones en un índice académico de 0.0 a 4.0, tomando en cuenta los créditos reales de cada asignatura.</p>
          </div>
        </div>
        <div className="index-guide-steps">
          <article className="index-guide-step blue">
            <span className="index-step-number">1</span>
            <div>
              <h3>Elige qué índice consultar</h3>
              <p><strong>Por período:</strong> selecciona el cuatrimestre y registra las notas de las materias que cursaste allí.</p>
              <p><strong>Acumulado:</strong> reúne tu historial y, si repetiste una materia, toma la calificación del período más reciente.</p>
            </div>
          </article>
          <article className="index-guide-step green">
            <span className="index-step-number">2</span>
            <div>
              <h3>Registra tus calificaciones</h3>
              <p>Escribe cada nota de 0 a 100 y pulsa <strong>Guardar</strong>. Los créditos y el nombre de las asignaturas se obtienen automáticamente del pensum.</p>
              <p>Para una materia repetida o cursada fuera de su período original, utiliza <strong>Agregar materia</strong>.</p>
            </div>
          </article>
          <article className="index-guide-step yellow">
            <span className="index-step-number">3</span>
            <div>
              <h3>Comprende el resultado</h3>
              <p>El índice no es un promedio simple: cada nota tiene un peso según los créditos de su asignatura. Una materia de más créditos influye más en el resultado.</p>
              <p>Las notas F cuentan sus créditos con 0.0 puntos; las asignaturas de 0 créditos no modifican el índice.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="index-intro paper-card">
        <strong>¿Qué índice deseas calcular?</strong>
        <div className="index-mode-switch" role="group" aria-label="Tipo de índice">
          <button
            type="button"
            className={mode === "period" ? "index-mode-button active" : "index-mode-button"}
            onClick={() => setMode("period")}
          >
            Cuatrimestral / por período
          </button>
          <button
            type="button"
            className={mode === "cumulative" ? "index-mode-button active" : "index-mode-button"}
            onClick={() => setMode("cumulative")}
          >
            Acumulado
          </button>
        </div>
        <p>La escala aplicada es A = 4.0, B = 3.0, C = 2.0, D = 1.0 y F = 0.0 puntos de calidad.</p>
      </section>

      {mode === "period" && selectedPeriod && (
        <section className="paper-card index-entry-panel">
          <div className="index-panel-heading">
            <div>
              <span className="eyebrow">CAPTURA DE NOTAS</span>
              <h2>Selecciona el período</h2>
              <p>Se muestran las materias del pensum para ese período y las electivas que hayas seleccionado.</p>
            </div>
            <label className="index-period-select">
              <span>Período académico</span>
              <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
                {periods.map((period) => (
                  <option value={period.id} key={period.id}>{period.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="add-course-row">
            <label>
              <span>¿Repetiste una materia o cursaste otra en este período?</span>
              <select value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}>
                <option value="">Agregar asignatura al período…</option>
                {availableCourses.map((course) => (
                  <option value={course.code} key={course.code}>
                    {course.code} · {course.name} ({course.credits} cr.)
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="secondary-button" onClick={addCourseToPeriod} disabled={!selectedCode}>
              Agregar materia
            </button>
          </div>

          {periodCourses.length ? (
            <div className="grade-entry-list">
              {periodCourses.map((course) => {
                const key = attemptKey(periodId, course.code);
                const attempt = gradeAttempts.find(
                  (item) => item.periodId === periodId && item.courseCode === course.code
                );
                const value = draftGrades[key] ?? "";
                const grade = Number(value);
                const valid = value.trim() !== "" && Number.isFinite(grade) && grade >= 0 && grade <= 100;
                const unchanged = !!attempt && attempt.grade === grade;
                return (
                  <article className="grade-entry-row" key={course.code}>
                    <div className="grade-course-copy">
                      <strong>{course.code}</strong>
                      <span>{course.name}</span>
                    </div>
                    <span className="grade-course-credits">{course.credits} cr.</span>
                    <label className="grade-input-field">
                      <span>Calificación (0–100)</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={value}
                        onChange={(event) => setDraftGrades((current) => ({
                          ...current,
                          [key]: event.target.value
                        }))}
                        placeholder="Ej. 87"
                      />
                    </label>
                    <div className="grade-quality">
                      {valid
                        ? letterForGrade(grade) + " · " + qualityPointsForGrade(grade).toFixed(1) + " pts"
                        : attempt
                          ? "Guardada: " + attempt.grade
                          : course.credits === 0
                            ? "No pondera (0 créditos)"
                            : "Sin calificación"}
                    </div>
                    <div className="grade-row-actions">
                      <button
                        type="button"
                        className="grade-save-button"
                        disabled={!valid || unchanged}
                        onClick={() => saveGrade(course)}
                      >
                        Guardar
                      </button>
                      {attempt && (
                        <button type="button" className="grade-remove-button" onClick={() => removeGrade(course)}>
                          Quitar
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="empty-message">No hay asignaturas para mostrar en este período.</p>
          )}
          {feedback && <p className="index-feedback" role="status">{feedback}</p>}
        </section>
      )}

      {mode === "cumulative" && (
        <section className="paper-card index-entry-panel">
          <span className="eyebrow">HISTORIAL ACADÉMICO</span>
          <h2>Última calificación por asignatura</h2>
          <p>Cuando una materia aparece más de una vez, el índice acumulado utiliza solamente la nota del período cronológicamente más reciente.</p>
          {orderedCumulativeAttempts.length ? (
            <div className="cumulative-grade-list">
              {orderedCumulativeAttempts.map((attempt) => {
                const course = courseByCode.get(attempt.courseCode);
                const period = periods.find((item) => item.id === attempt.periodId);
                if (!course) return null;
                return (
                  <div className="cumulative-grade-row" key={attempt.id}>
                    <span><strong>{course.code}</strong><small>{course.name}</small></span>
                    <span>{period?.label || "Período no identificado"}</span>
                    <strong>{attempt.grade} · {letterForGrade(attempt.grade)}</strong>
                    <span>{course.credits} cr. · {qualityPointsForGrade(attempt.grade).toFixed(1)} pts</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty-message">Todavía no has registrado calificaciones. Comienza seleccionando un período.</p>
          )}
        </section>
      )}

      <section className="index-result-panel">
        <div className="index-result-main">
          <span>{mode === "period" ? "ÍNDICE DEL PERÍODO" : "ÍNDICE ACUMULADO"}</span>
          <strong>{activeResult.index === null ? "—" : activeResult.index.toFixed(1)}</strong>
          <small>{activeResult.index === null ? "Registra calificaciones para calcularlo" : "Escala de 0.0 a 4.0"}</small>
        </div>
        <div className="index-result-details">
          <div><strong>{activeResult.courseCount}</strong><span>Materias ponderadas</span></div>
          <div><strong>{activeResult.totalCredits}</strong><span>Créditos considerados</span></div>
          <div><strong>{activeResult.qualityPoints.toFixed(2)}</strong><span>Puntos de calidad ponderados</span></div>
        </div>
      </section>

      <section className="index-formula paper-card">
        <strong>Cómo se calcula</strong>
        <p>Índice = suma de (puntos de calidad × créditos) ÷ suma de créditos cursados con calificación.</p>
        <p>El resultado se presenta redondeado a un decimal. Por ejemplo, un índice de 3.25 se muestra como 3.3.</p>
        <div className="grade-scale">
          <span><strong>A</strong> 90–100 · 4.0</span>
          <span><strong>B</strong> 80–89 · 3.0</span>
          <span><strong>C</strong> 70–79 · 2.0</span>
          <span><strong>D</strong> 60–69 · 1.0</span>
          <span><strong>F</strong> 0–59 · 0.0</span>
        </div>
        <small>Las materias reprobadas (F) sí aportan sus créditos al divisor, aunque suman cero puntos. Las asignaturas de cero créditos no alteran el índice.</small>
      </section>
    </>
  );
}

export default AcademicIndex;
