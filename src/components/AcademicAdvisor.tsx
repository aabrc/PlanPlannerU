import type { CourseDifficultyOverride } from "../types";
import type { AcademicAdvice, AdvisorRecommendation } from "../lib/academicAdvisor";

interface AcademicAdvisorProps extends AcademicAdvice {
  onOpenCourse: (courseCode: string) => void;
  onConfigurePeriod: () => void;
  onDifficultyChange: (courseCode: string, value: CourseDifficultyOverride | null) => void;
}

function RecommendationCard({
  item,
  index,
  onOpenCourse,
  onDifficultyChange
}: {
  item: AdvisorRecommendation;
  index: number;
  onOpenCourse: (courseCode: string) => void;
  onDifficultyChange: (courseCode: string, value: CourseDifficultyOverride | null) => void;
}) {
  const { course, difficulty } = item;

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
            <span>Dificultad estimada</span>
            <select
              value={difficulty.override || ""}
              onChange={(event) => onDifficultyChange(
                course.code,
                event.target.value
                  ? event.target.value as CourseDifficultyOverride
                  : null
              )}
              aria-label={"Ajustar dificultad de " + course.code}
            >
              <option value="">Automática</option>
              <option value="light">Fácil para mí</option>
              <option value="moderate">Moderada para mí</option>
              <option value="demanding">Difícil para mí</option>
            </select>
          </label>
        </div>
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
  onDifficultyChange
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
                  onDifficultyChange={onDifficultyChange}
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
                  onDifficultyChange={onDifficultyChange}
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
