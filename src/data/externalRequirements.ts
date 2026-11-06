export interface ExternalRequirementInfo { title: string; detail: string; auto: boolean; }
export const EXTERNAL_INFO: Record<string, ExternalRequirementInfo> = {
  MAT311: { title: "Requisito de Álgebra Lineal", detail: "Se utiliza como requisito previo de MAT130. El plan no indica una denominación independiente.", auto: true },
  ILE203: { title: "Nivelación de Inglés (ILE-203-T)", detail: "Marcada como cumplida por el examen de admisión.", auto: true },
  ICC133: { title: "Código previo de ICC331 · Sistemas Operativos", detail: "El documento lo muestra como prerrequisito, pero no incluye una ficha o nombre en el listado ITT-2020.", auto: false },
  ILE311: { title: "Requisito previo de ILE498 · Inglés para las Ingenierías", detail: "El documento solo muestra el código ILE311; no proporciona un nombre descriptivo.", auto: false },
  ILE322: { title: "Requisito previo de ILE498 · Inglés para las Ingenierías", detail: "El documento solo muestra el código ILE322; no proporciona un nombre descriptivo.", auto: false },
  "1ITT102": { title: "Código previo de ICC352 · Programación Web", detail: "El PDF lo registra como requisito sin nombre. No se debe asumir que equivale a 1ITT112.", auto: false },
  ITT102: { title: "Código previo de ICC352 · Programación Web", detail: "No se asume que sea equivalente a ITT112, Introducción a las Redes.", auto: false },
  MAT134: { title: "Código previo de ICC362 · Introducción a la Inteligencia Artificial", detail: "El documento solo muestra MAT134 como requisito y no indica el nombre del curso.", auto: false }
};
