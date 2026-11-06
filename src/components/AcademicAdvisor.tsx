import type { Course } from "../types";

export interface AdvisorRecommendation {
  course: Course;
  unlocks: number;
  periodLabel: string;
}

export interface AdvisorLaggedCourse {
  course: Course;
  periodLabel: string;
}

interface AcademicAdvisorProps {
  recommendations: AdvisorRecommendation[];
  laggedCourses: AdvisorLaggedCourse[];
  hasCurrentPeriod: boolean;
  onOpenCourse: (courseCode: string) => void;
  onConfigurePeriod: () => void;
}

function AcademicAdvisor({
  recommendations,
  laggedCourses,
  hasCurrentPeriod,
  onOpenCourse,
  onConfigurePeriod
}: AcademicAdvisorProps) {
  return (
    <section className="advisor-panel paper-card" aria-labelledby="advisor-title">
      <header className="advisor-heading">
        <div>
          <span className="eyebrow">ORIENTACIÓN ACADÉMICA</span>
          <h2 id="advisor-title">Asesor académico</h2>
          <p>
            Identifica asignaturas que ya puedes cursar y aquellas que podrían
            abrirte camino hacia otras materias.
          </p>
        </div>
        <span className="advisor-heading-mark" aria-hidden="true">✦</span>
      </header>

      <div className="advisor-columns">
        <section className="advisor-column" aria-labelledby="advisor-priority-title">
          <div className="advisor-column-heading">
            <h3 id="advisor-priority-title">¿En qué conviene avanzar?</h3>
            <span>Prioridades sugeridas</span>
          </div>
          {recommendations.length ? (
            <div className="advisor-course-list">
              {recommendations.map(({ course, unlocks, periodLabel }, index) => (
                <article className="advisor-course" key={course.code}>
                  <span className="advisor-course-rank">{index + 1}</span>
                  <div className="advisor-course-main">
                    <div className="advisor-course-topline">
                      <strong>{course.code}</strong>
                      <span className={unlocks > 0 ? "advisor-unlock-count" : "advisor-available"}>
                        {unlocks > 0
                          ? unlocks + (unlocks === 1 ? " materia relacionada" : " materias relacionadas")
                          : "Disponible"}
                      </span>
                    </div>
                    <p>{course.name}</p>
                    <small>{periodLabel} · {course.credits} créditos</small>
                    <button type="button" onClick={() => onOpenCourse(course.code)}>
                      Ver en el pensum <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="advisor-empty">
              No hay materias obligatorias o electivas seleccionadas disponibles
              para recomendar en este momento. Revisa tus electivas y requisitos externos.
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
              {laggedCourses.map(({ course, periodLabel }) => (
                <article className="advisor-lagged-course" key={course.code}>
                  <div>
                    <strong>{course.code}</strong>
                    <p>{course.name}</p>
                    <small>{periodLabel} · {course.credits} créditos</small>
                  </div>
                  <button type="button" onClick={() => onOpenCourse(course.code)} aria-label={"Ver " + course.code + " en el pensum"}>
                    Ver
                  </button>
                </article>
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
        Estas sugerencias se calculan con el pensum y los estados que has registrado.
        La disponibilidad real depende de la oferta académica y de la confirmación de tus requisitos.
      </p>
    </section>
  );
}

export default AcademicAdvisor;
