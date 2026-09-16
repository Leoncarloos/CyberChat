# Arquitectura lógica — CyberChat

Esta vista describe **cómo se organiza el software en módulos funcionales y cómo se relacionan entre sí**.
A diferencia de la arquitectura por capas (`arquitectura-capas.md`), que ordena el sistema por responsabilidad
técnica —presentación, aplicación, datos—, la arquitectura lógica se lee en términos del negocio: qué hace
cada parte del sistema y de qué depende. Está pensada para ser comprensible sin conocimiento técnico previo.

## Sobre el uso del modelo C4

Se adopta el **modelo C4** como marco conceptual, por ser un estándar reconocido para documentar arquitectura
de software en distintos niveles de detalle. De sus cuatro niveles se emplean dos:

| Nivel C4 | Uso en este documento | Motivo |
|---|---|---|
| **1 · Contexto** | Sí — diagrama 1 | Sitúa el sistema frente a sus usuarios y servicios de apoyo. Es el nivel menos técnico. |
| **2 · Contenedores** | No | Corresponde a la vista de despliegue y tecnología, ya cubierta por la arquitectura por capas. Incluirlo duplicaría el contenido. |
| **3 · Componentes** | Sí — diagrama 2 | Es exactamente la organización en módulos y sus relaciones. Se expresa en lenguaje funcional, no técnico. |
| **4 · Código** | No | Nivel de clases y funciones: excesivo para una memoria de tesis y volátil. |

**Los diagramas no se dibujan con la sintaxis `C4Context` de Mermaid.** Esa extensión está marcada como
experimental y carece de motor de posicionamiento: apila los elementos verticalmente y superpone las etiquetas
de relación sobre las cajas, lo que impide obtener una figura publicable. Se usa `flowchart`, que respeta la
semántica del modelo C4 y permite controlar la composición.

---

## 1. Nivel 1 · Contexto del sistema

Quién usa CyberChat y en qué servicios externos se apoya.

```mermaid
flowchart TB
    classDef actor fill:#dbeafe,stroke:#1d4ed8,stroke-width:2px,color:#1e3a8a
    classDef sistema fill:#fef3c7,stroke:#b45309,stroke-width:3px,color:#78350f
    classDef externo fill:#f1f5f9,stroke:#64748b,stroke-width:1.5px,color:#334155

    EMP["Empleado de la MYPE<br/>Se capacita, consulta dudas<br/>y es evaluado periódicamente"]
    DUE["Dueño de la MYPE<br/>Administra su organización<br/>y toma decisiones de capacitación"]

    CC["CyberChat<br/>Plataforma web de concientización<br/>en ciberseguridad para MYPES peruanas"]

    IA["Servicio de IA generativa<br/>Redacta respuestas, resúmenes<br/>y recomendaciones"]
    VEC["Servicio de vectorización<br/>Convierte texto en representaciones<br/>comparables por significado"]
    NUBE["Plataforma de datos en la nube<br/>Identidad, base de datos<br/>y almacenamiento de archivos"]

    EMP -->|"Consulta al asistente, rinde evaluaciones<br/>y revisa su progreso"| CC
    DUE -->|"Aprueba empleados, carga documentos<br/>y consulta métricas de su empresa"| CC
    CC -->|"Solicita texto generado"| IA
    CC -->|"Solicita vectores de texto"| VEC
    CC -->|"Guarda y consulta información"| NUBE

    class EMP,DUE actor
    class CC sistema
    class IA,VEC,NUBE externo
```

---

## 2. Nivel 3 · Módulos lógicos y sus relaciones

Los ocho módulos funcionales del sistema, agrupados en cuatro áreas.

```mermaid
flowchart TB
    classDef area fill:#f8fafc,stroke:#475569,stroke-width:1.5px,color:#0f172a
    classDef mod fill:#ffffff,stroke:#1d4ed8,stroke-width:1.5px,color:#1e3a8a
    classDef actor fill:#dbeafe,stroke:#1d4ed8,stroke-width:2px,color:#1e3a8a
    classDef externo fill:#f1f5f9,stroke:#64748b,stroke-width:1.5px,color:#334155

    EMP["Empleado"]
    DUE["Dueño de la MYPE"]

    subgraph A1["ÁREA 1 · Acceso y organización"]
        direction LR
        M1["M1 · Identidad y control de acceso<br/>Registro de la empresa y su dueño<br/>Solicitud de acceso del empleado<br/>Inicio y cierre de sesión<br/>Recuperación de contraseña<br/>Roles y estados de aprobación"]
        M2["M2 · Administración de la organización<br/>Aviso de solicitudes pendientes<br/>Aprobación y rechazo de empleados<br/>Corrección de decisiones previas<br/>Consulta de empleados por estado"]
    end

    subgraph A2["ÁREA 2 · Evaluación y aprendizaje"]
        direction LR
        M3["M3 · Evaluación del conocimiento<br/>Diagnóstico inicial obligatorio<br/>Evaluación final y recurrentes<br/>Banco fijo de preguntas<br/>Calificación y desempeño por tema<br/>Historial de intentos"]
        M6["M6 · Ruta de aprendizaje<br/>Nivel alcanzado en cada tema<br/>Temas prioritarios a reforzar<br/>Accesos directos por tema<br/>Seguimiento del avance"]
    end

    subgraph A3["ÁREA 3 · Asistencia y conocimiento"]
        direction LR
        M4["M4 · Base de conocimiento documental<br/>Carga de documentos de la empresa<br/>Extracción y fragmentación del texto<br/>Indexación por significado<br/>Consulta y eliminación de documentos"]
        M5["M5 · Asistente virtual conversacional<br/>Diálogo sobre ciberseguridad<br/>Respuestas apoyadas en los documentos<br/>Alcance limitado al dominio<br/>Historial de conversaciones"]
    end

    subgraph A4["ÁREA 4 · Información para decidir"]
        direction LR
        M7["M7 · Analítica y reportes<br/>Tablero personal del empleado<br/>Tablero de la organización<br/>Resultados por tema y nivel de riesgo<br/>Exportación de datos"]
        M8["M8 · Generación asistida por IA<br/>Resumen ejecutivo de la organización<br/>Recomendaciones personalizadas"]
    end

    EXT["Servicios externos<br/>IA generativa · vectorización<br/>datos en la nube"]

    EMP --> M1
    DUE --> M1
    DUE --> M2
    DUE --> M4

    M2 -->|"determina quién pertenece a la empresa"| M1
    M1 -->|"autoriza"| M3
    M1 -->|"autoriza"| M5
    M1 -->|"autoriza"| M7

    M3 -->|"nivel por tema"| M6
    M3 -->|"resultados y evolución"| M7
    M6 -->|"inicia conversaciones dirigidas"| M5
    M4 -->|"aporta el contexto de la empresa"| M5
    M5 -->|"uso e interacciones"| M7
    M7 -->|"métricas agregadas"| M8
    M3 -->|"desempeño por tema"| M8
    M8 -->|"resumen y recomendaciones"| M7

    M5 --> EXT
    M4 --> EXT
    M8 --> EXT

    class A1,A2,A3,A4 area
    class M1,M2,M3,M4,M5,M6,M7,M8 mod
    class EMP,DUE actor
    class EXT externo
```

---

## 3. Responsabilidad de cada módulo

| Módulo | Responsabilidad | Depende de | Alimenta a |
|---|---|---|---|
| **M1 · Identidad y control de acceso** | Establece quién es cada usuario, a qué empresa pertenece y qué puede hacer | M2 (estado de aprobación) | Todos los módulos |
| **M2 · Administración de la organización** | Permite al dueño decidir qué empleados acceden a la plataforma | M1 | M1 |
| **M3 · Evaluación del conocimiento** | Mide el nivel de concientización al inicio, al final y de forma periódica | M1 | M6, M7, M8 |
| **M4 · Base de conocimiento documental** | Incorpora los documentos propios de la empresa como fuente de consulta | M1 | M5 |
| **M5 · Asistente virtual conversacional** | Resuelve dudas de ciberseguridad apoyándose en el contexto de la empresa | M1, M4, M6 | M7 |
| **M6 · Ruta de aprendizaje** | Orienta al empleado hacia los temas donde su nivel es más bajo | M1, M3 | M5 |
| **M7 · Analítica y reportes** | Presenta el progreso individual y el estado de la organización | M1, M3, M5, M8 | M8 |
| **M8 · Generación asistida por IA** | Interpreta los resultados y propone acciones concretas | M1, M3, M7 | M7 |

---

## 4. Cómo leer los diagramas

- **Rectángulo azul claro** — persona que usa el sistema.
- **Rectángulo ámbar** — el sistema completo, visto desde afuera.
- **Rectángulo gris** — servicio externo del que depende la plataforma.
- **Rectángulo blanco con borde azul** — módulo funcional del sistema.
- **Caja con título** — área funcional que agrupa módulos afines.
- **Flecha** — dependencia o flujo de información; la etiqueta indica qué aporta el origen al destino.
- El módulo **M1** condiciona el acceso a **todos** los módulos del sistema. Para no saturar el diagrama solo se
  dibuja su relación con un módulo representativo de cada área.

El ciclo central del sistema se lee siguiendo las flechas: el empleado **es evaluado** (M3), esa medición
**define su ruta** (M6), la ruta **lo lleva a conversar** con el asistente (M5), el asistente **se apoya en los
documentos** de su empresa (M4), y todo ello **se refleja en los tableros** (M7), que la IA **interpreta y
convierte en recomendaciones** (M8) para cerrar el ciclo.
