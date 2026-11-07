import type {
  AdvisorChallengeFactor,
  AdvisorCourseProfile,
  AdvisorReadiness,
  AdvisorCourseExperience,
  CourseDifficultyOverride
} from "../types";
import type { AcademicAdvice, AdvisorRecommendation } from "../lib/academicAdvisor";

interface AcademicAdvisorProps extends AcademicAdvice {
  onOpenCourse: (courseCode: string) => void;
  onConfigurePeriod: () => void;
  onProfileChange: (courseCode: string, patch: Partial<AdvisorCourseProfile>) => void;
}

const CHALLENGE_FACTORS: { value: AdvisorChallengeFactor; label: string }[] = [
  { value: "foundations", label: "Fundamentos previos" },
  { value: "teaching-method", label: "Metodología de enseñanza" },
  { value: "assessments", label: "Evaluaciones" },
  { value: "practical-skills", label: "Práctica y desarrollo de habilidades" },
  { value: "time-constraints", label: "Tiempo y otras responsabilidades" }
];

function RecommendationRow({
  item,
  index,
  onOpenCourse,
  onProfileChange
}: {
  item: AdvisorRecommendation;
  index: number;
  onOpenCourse: (courseCode: string) => void;
  onProfileChange: (courseCode: string, patch: Partial<AdvisorCourseProfile>) => void;
}) {
  const { course, difficulty, profile } = item;

  const updateChallengeFactor = (factor: AdvisorChallengeFactor, checked: boolean) => {
    const current = profile.challengeFactors || [];
    const next = checked
      ? Array.from(new Set([...current, factor]))
      : current.filter((item) => item !== factor);
    onProfileChange(course.code, {
      challengeFactors: next.length ? next : undefined
    });
  };

  const difficultySource = difficulty.source === "ajustada por ti"
    ? "Ajustada según tu experiencia"
    : difficulty.source === "experiencia compartida"
      ? "Experiencia compartida por " + (difficulty.sampleCount || 0) + " estudiantes"
      : "Estimación inicial";

  return (
    <details className="advisor-course-row" key={course.code}>
      <summary className="advisor-course-summary">
        <span className="advisor-course-rank">{index + 1}</span>
        <span className="advisor-course-summary-copy">
          <strong>{course.code}</strong>
          <span>{course.name}</span>
          <small>
            {item.periodLabel} · {course.credits} créditos · {item.canEnroll ? "Disponible para cursar" : "Pendiente por desbloquear"}
          </small>
        </span>
        <span className="advisor-course-summary-meta">
          {!item.canEnroll
            ? "Pendiente por desbloquear"
            : item.directUnlocks > 0
              ? item.directUnlocks + (item.directUnlocks === 1 ? " desbloqueo directo" : " desbloqueos directos")
              : item.unlocks > 0
                ? item.unlocks + " relacionadas"
                : "Disponible"}
        </span>
        <span className="advisor-expand-mark" aria-hidden="true">⌄</span>
      </summary>

      <div className="advisor-course-detail">
        <div className="advisor-course-detail-facts">
          <span>{course.credits} créditos</span>
          <span>{item.canEnroll ? "Disponible para cursar" : "Pendiente por desbloquear"}</span>
          <span>Impacto potencial en índice: {item.indexImpact}</span>
          {item.blockers.length > 0 && (
            <span>Requisitos pendientes: {item.blockers.join(", ")}</span>
          )}
          {item.unlocks > 0 && <span>Abre camino a {item.unlocks} materias relacionadas</span>}
        </div>

        <div className="advisor-estimate-row">
          <span className={"advisor-difficulty-pill " + difficulty.level.toLowerCase()}>
            Esfuerzo {difficulty.level.toLowerCase()}
          </span>
          <small className="advisor-estimate-source">{difficultySource}</small>
          <label className="advisor-difficulty-control">
            <span>Dificultad para mí</span>
            <select
              value={profile.difficultyOverride || ""}
              onChange={(event) => onProfileChange(
                course.code,
                {
                  difficultyOverride: event.target.value
                    ? event.target.value as CourseDifficultyOverride
                    : undefined
                }
              )}
              aria-label={"Ajustar dificultad de " + course.code}
            >
              <option value="">Automática</option>
              <option value="light">Me resulta fácil</option>
              <option value="moderate">Me resulta moderada</option>
              <option value="demanding">Me resulta difícil</option>
            </select>
          </label>
        </div>

        <details className="advisor-profile-details">
          <summary>Mi preparación y experiencia con esta materia</summary>
          <div className="advisor-profile-fields">
            <label>
              <span>¿Cómo te sientes respecto a sus fundamentos?</span>
              <select
                value={profile.readiness || ""}
                onChange={(event) => onProfileChange(course.code, {
                  readiness: (event.target.value || undefined) as AdvisorReadiness | undefined
                })}
              >
                <option value="">Todavía no lo he indicado</option>
                <option value="prepared">Me siento preparado</option>
                <option value="some-gaps">Tengo algunas lagunas</option>
                <option value="needs-review">Necesito reforzar conocimientos</option>
              </select>
            </label>
            <label>
              <span>¿Cómo te ha resultado la asignatura?</span>
              <select
                value={profile.experience || ""}
                onChange={(event) => onProfileChange(course.code, {
                  experience: (event.target.value || undefined) as AdvisorCourseExperience | undefined
                })}
              >
                <option value="">Aún no tengo una experiencia que registrar</option>
                <option value="not-started">Todavía no la he cursado</option>
                <option value="manageable">Me ha resultado manejable</option>
                <option value="as-expected">Ha sido como esperaba</option>
                <option value="challenging">Me ha resultado más exigente</option>
              </select>
            </label>
            <fieldset className="advisor-challenge-factors">
              <legend>¿Qué factores te han presentado dificultades? (opcional)</legend>
              {CHALLENGE_FACTORS.map((factor) => (
                <label key={factor.value}>
                  <input
                    type="checkbox"
                    checked={(profile.challengeFactors || []).includes(factor.value)}
                    onChange={(event) => updateChallengeFactor(factor.value, event.target.checked)}
                  />
                  <span>{factor.label}</span>
                </label>
              ))}
            </fieldset>
            <small className="advisor-profile-privacy">
              Estas respuestas pertenecen a tu progreso personal y se guardan localmente en este navegador. No modifican el pensum ni se atribuyen a un profesor; la sincronización se incorporará en la etapa de datos.
            </small>
          </div>
        </details>

        <ul className="advisor-reasons">
          {item.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
        <button type="button" className="advisor-open-course" onClick={() => onOpenCourse(course.code)}>
          Ver en el pensum <span aria-hidden="true">↗</span>
        </button>
      </div>
    </details>
  );
}

function AcademicAdvisor({
  recommendations,
  laggedCourses,
  hasCurrentPeriod,
  targetCredits,
  activeCredits,
  remainingCredits,
  paceLabel,
  onOpenCourse,
  onConfigurePeriod,
  onProfileChange
}: AcademicAdvisorProps) {
  return (
    <section className="advisor-panel paper-card" aria-labelledby="advisor-title">
      <header className="advisor-heading">
        <div>
          <span className="eyebrow">ORIENTACIÓN ACADÉMICA</span>
          <h2 id="advisor-title">Asesor académico</h2>
          <p>
            Prioriza las materias según tus pendientes, prerrequisitos, créditos,
            carga académica y experiencia personal. Selecciona una asignatura para ver sus detalles.
          </p>
        </div>
        <span className="advisor-heading-mark" aria-hidden="true">✦</span>
      </header>

      <section className="advisor-load-summary" aria-label="Resumen de carga académica">
        <div><span>Ritmo elegido</span><strong>{paceLabel}</strong></div>
        <div><span>Meta por período</span><strong>{targetCredits} cr.</strong></div>
        <div><span>En curso</span><strong>{activeCredits} cr.</strong></div>
        <div><span>Espacio restante</span><strong>{remainingCredits} cr.</strong></div>
      </section>

      <div className="advisor-columns">
        <section className="advisor-column" aria-labelledby="advisor-priority-title">
          <div className="advisor-column-heading">
            <h3 id="advisor-priority-title">¿En qué conviene avanzar?</h3>
            <span>{recommendations.length} sugerencias</span>
          </div>
          {recommendations.length ? (
            <div className="advisor-course-list" role="list">
              {recommendations.map((item, index) => (
                <div role="listitem" key={item.course.code}>
                  <RecommendationRow
                    item={item}
                    index={index}
                    onOpenCourse={onOpenCourse}
                    onProfileChange={onProfileChange}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="advisor-empty">
              No hay materias obligatorias o electivas seleccionadas disponibles
              para recomendar. Revisa tus electivas y requisitos externos.
            </p>
          )}
        </section>

        <section className="advisor-column" aria-labelledby="advisor-lagged-title">
          <div className="advisor-column-heading">
            <h3 id="advisor-lagged-title">Materias rezagadas</h3>
            <span>{laggedCourses.length} identificadas</span>
          </div>
          {!hasCurrentPeriod ? (
            <div className="advisor-empty advisor-empty-action">
              <p>
                Para detectar materias pendientes de períodos anteriores, estén habilitadas
                o todavía tengan requisitos por desbloquear, indica cuál es tu período actual.
              </p>
              <button type="button" className="secondary-button" onClick={onConfigurePeriod}>
                Configurar período actual
              </button>
            </div>
          ) : laggedCourses.length ? (
            <div className="advisor-course-list" role="list">
              {laggedCourses.map((item, index) => (
                <div role="listitem" key={item.course.code}>
                  <RecommendationRow
                    item={item}
                    index={index}
                    onOpenCourse={onOpenCourse}
                    onProfileChange={onProfileChange}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="advisor-empty">
              No hay materias pendientes de períodos anteriores fuera de las cinco
              prioridades principales. Las asignaturas bloqueadas también se consideran rezagadas.
            </p>
          )}
        </section>
      </div>
      <p className="advisor-disclaimer">
        La dificultad automática es una estimación inicial, no una calificación oficial.
        Más adelante podrá complementarse con experiencias compartidas y agregadas de estudiantes,
        sin publicar perfiles individuales. El impacto en el índice depende de la nota que obtengas:
        más créditos amplifican tanto una buena como una mala calificación.
      </p>
    </section>
  );
}

export default AcademicAdvisor;
