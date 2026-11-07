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

function RecommendationCard({
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

  return (
    <article className="advisor-course">
      <span className="advisor-course-rank">{index + 1}</span>
      <div className="advisor-course-main">
        <div className="advisor-course-topline">
          <strong>{course.code}</strong>
          <span className={item.unlocks > 0 ? "advisor-unlock-count" : "advisor-available"}>
            {item.directUnlocks > 0
              ? item.directUnlocks + (item.directUnlocks === 1 ? " desbloqueo directo" : " desbloqueos directos")
              : item.unlocks > 0
                ? item.unlocks + " materias relacionadas"
                : "Disponible"}
          </span>
        </div>
        <p>{course.name}</p>
        <small>{item.periodLabel} · {course.credits} créditos · Impacto potencial en índice: {item.indexImpact}</small>
        <div className="advisor-estimate-row">
          <span className={"advisor-difficulty-pill " + difficulty.level.toLowerCase()}>
            Esfuerzo {difficulty.level.toLowerCase()}
          </span>
          <small className="advisor-estimate-source">
            {difficulty.source === "ajustada por ti" ? "Ajustada según tu experiencia" : "Estimación inicial"}
          </small>
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
              Estas respuestas describen tu experiencia personal; no modifican el pensum ni se atribuyen a un profesor.
            </small>
          </div>
        </details>

        <ul className="advisor-reasons">
          {item.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
        <button type="button" onClick={() => onOpenCourse(course.code)}>
          Ver en el pensum <span aria-hidden="true">↗</span>
        </button>
      </div>
    </article>
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
            Combina materias rezagadas, prerrequisitos, créditos, esfuerzo estimado
            y la carga que deseas llevar. Los créditos no se interpretan como dificultad.
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
            <div className="advisor-course-list">
              {recommendations.map((item, index) => (
                <RecommendationCard
                  key={item.course.code}
                  item={item}
                  index={index}
                  onOpenCourse={onOpenCourse}
                  onProfileChange={onProfileChange}
                />
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
            <h3 id="advisor-lagged-title">Materias rezagadas disponibles</h3>
            <span>{laggedCourses.length} identificadas</span>
          </div>
          {!hasCurrentPeriod ? (
            <div className="advisor-empty advisor-empty-action">
              <p>
                Para detectar materias de períodos anteriores que puedes cursar,
                primero indica cuál es tu período actual.
              </p>
              <button type="button" className="secondary-button" onClick={onConfigurePeriod}>
                Configurar período actual
              </button>
            </div>
          ) : laggedCourses.length ? (
            <div className="advisor-course-list">
              {laggedCourses.map((item, index) => (
                <RecommendationCard
                  key={item.course.code}
                  item={item}
                  index={index}
                  onOpenCourse={onOpenCourse}
                  onProfileChange={onProfileChange}
                />
              ))}
            </div>
          ) : (
            <p className="advisor-empty">
              No aparecen materias pendientes de períodos anteriores que estén
              libres de requisitos según tu registro actual.
            </p>
          )}
        </section>
      </div>
      <p className="advisor-disclaimer">
        La dificultad automática es una estimación inicial, no una calificación oficial.
        Puedes ajustarla según tu experiencia. El impacto en el índice depende de la nota
        que obtengas: más créditos amplifican tanto una buena como una mala calificación.
        La disponibilidad real depende de la oferta académica y de la confirmación de requisitos.
      </p>
    </section>
  );
}

export default AcademicAdvisor;
