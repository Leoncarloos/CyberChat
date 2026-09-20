# Vista lógica — modelo 4+1

Vista lógica de CyberChat según Kruchten, *Architectural Blueprints — The "4+1" View Model of
Software Architecture* (IEEE Software 12(6), 1995). Diagrama editable:
[arquitectura-logica-4mas1.drawio](arquitectura-logica-4mas1.drawio).

## Reglas que sigue el diagrama

La vista lógica responde a los **requisitos funcionales**: qué servicios debe prestar el sistema a
sus usuarios. Se obtiene por descomposición orientada a objetos, con dos criterios que da el paper:

- **Solo lo arquitectónicamente significativo.** No se dibujan todas las clases, sino las pocas que
  explican la estructura. Los adornos de la notación de Booch se omiten.
- **Dos niveles de detalle**, como en las figuras 3a y 3b del paper: las clases principales y, para
  sistemas grandes, la agrupación en categorías de clases.

Notación (figura 2 del paper):

| Símbolo | Significado |
|---|---|
| Nube de línea punteada | Clase |
| Nube sombreada | Clase utilitaria: ofrece un servicio, no representa una entidad |
| Rectángulo | Categoría de clases |
| Línea simple | Asociación |
| Línea con círculo relleno | Contención o agregación, del lado del todo |
| Línea con círculo hueco | Uso, del lado del cliente |
| Flecha sólida | Herencia |

## a. Clases principales

| Clase | Qué representa |
|---|---|
| **Empresa** | La MYPE. Agrupa a sus colaboradores y es dueña de sus documentos |
| **Colaborador** | Persona que usa la plataforma, con su rol dentro de la empresa |
| **Conversación** | Diálogo con el asistente, con sus mensajes |
| **Documento** | Material de la empresa que alimenta la base de conocimiento |
| **Evaluación** | Intento de diagnóstico, post-test o evaluación recurrente |
| **Ruta de aprendizaje** | Estado del colaborador en cada tema |
| **Resumen organizacional** | Informe ejecutivo del estado de la empresa |

Clases utilitarias, que son los servicios donde vive la técnica RAG:

| Clase utilitaria | Responsabilidad |
|---|---|
| **Servicios de indexación** | Fragmentar documentos y representarlos como vectores |
| **Servicios de recuperación** | Buscar los fragmentos más parecidos a la consulta |
| **Servicios de generación** | Producir la respuesta a partir del contexto recuperado |
| **Servicios de calificación** | Corregir las evaluaciones y medir el desempeño por tema |
| **Servicios de métricas** | Agregar resultados y uso para el nivel organizacional |

## b. Categorías de clases

Agrupación de alto nivel: interfaz de usuario, acceso e identidad, asistente conversacional,
conocimiento documental, evaluación y aprendizaje, métricas organizacionales, servicios de IA y
mecanismos comunes. Las categorías se relacionan por **uso**, y ninguna usa a la interfaz de
usuario, que es siempre el punto de entrada.

## Nota sobre el alcance

Kruchten señala que no toda arquitectura necesita las cinco vistas. En CyberChat la **vista de
proceso** aporta poco, porque cada petición se atiende en una función sin estado y sin procesos
concurrentes propios. Las demás vistas ya están documentadas: lógica (este documento y el modelo
C4), desarrollo ([arquitectura-3-capas.md](arquitectura-3-capas.md)) y física
([arquitectura-fisica.md](arquitectura-fisica.md)).
