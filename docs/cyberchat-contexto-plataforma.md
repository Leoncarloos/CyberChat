# CyberChat — Descripción funcional y lógica de la plataforma

> Documento de contexto: explica qué es CyberChat, para quién es, qué puede hacer cada rol y cómo funciona por dentro cada módulo (chat con RAG, evaluaciones, ruta de aprendizaje, dashboards e IA).

---

## 1. Qué es y para qué sirve

**CyberChat** es una plataforma web para **concientizar en ciberseguridad** al personal de **MYPES peruanas** (micro y pequeñas empresas). Las MYPES suelen ser blanco de phishing, ransomware y fraudes digitales, y no tienen presupuesto para consultoras ni personal especializado. CyberChat les ofrece:

1. **Un asistente conversacional (chatbot) con IA** especializado en ciberseguridad, que responde usando **los documentos propios de cada empresa** (políticas, manuales) mediante **RAG** (*Retrieval-Augmented Generation*, generación aumentada por recuperación).
2. **Evaluaciones** para medir el nivel de conocimiento: un **diagnóstico inicial** obligatorio, un **post-test** y **evaluaciones recurrentes** cada 5 días.
3. **Una ruta de aprendizaje personalizada** según los temas débiles de cada persona.
4. **Dashboards**: uno personal para el empleado y uno organizacional para el dueño de la empresa, con un **resumen ejecutivo generado por IA**.

Es **multiempresa**: cada empresa se identifica por su **RUC** (Registro Único de Contribuyentes, el identificador tributario peruano). Cada empresa tiene un dueño (admin) y sus empleados; ninguna empresa ve datos ni documentos de otra.

### Los 8 temas de ciberseguridad

Todo el contenido evaluativo y la ruta de aprendizaje giran en torno a un catálogo fijo de 8 temas:

| Clave | Tema |
|---|---|
| `phishing` | Phishing e Ingeniería Social |
| `ia_amenazas` | Inteligencia Artificial y Nuevas Amenazas (deepfakes, clonación de voz) |
| `canales_venta` | Seguridad en Canales de Venta Digitales (tienda online, WhatsApp, pagos) |
| `contrasenas` | Gestión de Contraseñas (gestores, contraseñas fuertes, MFA) |
| `accesos` | Control de Accesos (mínimo privilegio, baja de empleados) |
| `ley_29733` | Protección de la Información del Cliente (Ley N.° 29733 de protección de datos personales) |
| `datos_sensibles` | Manejo de Datos Sensibles (tarjetas, documentos de clientes) |
| `resiliencia` | Resiliencia con Recursos Mínimos (backups 3-2-1, respuesta a ransomware) |

---

## 2. Roles

| Rol | Quién es | Qué puede hacer |
|---|---|---|
| **Administrador** (`admin`) | El **dueño de la empresa**. Se registra junto con su empresa (RUC). Hay un solo admin por RUC. | Todo lo del empleado **más**: aprobar/rechazar/editar empleados, subir y gestionar los documentos de la base de conocimiento (RAG), ver el dashboard organizacional, exportar reportes CSV y generar el resumen ejecutivo con IA. |
| **Empleado** (`employee`) | Trabajador de la empresa. Se registra indicando el RUC de su empleador. | Usar el chat con IA, rendir evaluaciones, seguir su ruta de aprendizaje y ver su dashboard personal. **Necesita ser aprobado por el dueño** antes de poder entrar. |

### Estado de aprobación del empleado
- `pending` (pendiente): recién registrado, esperando que el dueño lo apruebe. No puede usar la plataforma.
- `active` (activo): aprobado; acceso completo a sus módulos.
- `rejected` (rechazado): el dueño le denegó el acceso. No puede usar la plataforma.

El dueño siempre queda `active` al registrarse.

### Mapa de pantallas por rol

| Ruta | Pantalla | Empleado | Admin |
|---|---|---|---|
| `/login` | Inicio de sesión | ✔ | ✔ |
| `/register` | Elegir tipo de registro | ✔ | ✔ |
| `/register/admin` | Registro de dueño + empresa | | ✔ |
| `/register/employee` | Solicitud de acceso de empleado | ✔ | |
| `/forgot-password`, `/reset-password` | Recuperación de contraseña | ✔ | ✔ |
| `/diagnostic` | Evaluación diagnóstica inicial (obligatoria) | ✔ | ✔ |
| `/chat` | Chat con IA + Evaluaciones + Ruta de aprendizaje | ✔ | ✔ |
| `/dashboard` | Dashboard personal | ✔ | ✔ |
| `/manage` | Gestión de empleados | | ✔ |
| `/admin` | Documentos RAG (base de conocimiento) | | ✔ |
| `/org-dashboard` | Dashboard organizacional + resumen IA | | ✔ |

---

## 3. Flujo general del usuario

```
Registro ──► (empleado: espera aprobación del dueño) ──► Login
   ──► Diagnóstico inicial obligatorio (una sola vez)
   ──► Chat con IA / Ruta de aprendizaje / Evaluaciones / Dashboard
   ──► Post-test (primera evaluación tras el diagnóstico)
   ──► Evaluación recurrente cada 5 días (ciclo continuo)
```

### 3.1 Registro

**Dueño de empresa (`/register/admin`)** — ingresa RUC, razón social, nombre comercial, nombre del dueño, correo, teléfono y contraseña.
- El sistema verifica que **no exista ya un admin con ese RUC** (un RUC = un dueño).
- Crea la cuenta con rol `admin`, el RUC y estado `active`. No requiere verificación de correo.

**Empleado (`/register/employee`)** — ingresa RUC de su empresa, nombres, apellidos, correo y contraseña.
- El sistema verifica que **exista un dueño registrado con ese RUC**; si no, rechaza el registro.
- Crea la cuenta con rol `employee`, el RUC y estado `pending`.
- El empleado queda a la espera de que el dueño lo apruebe desde `/manage`.

### 3.2 Login
- Tras autenticarse, se leen rol y estado de aprobación:
  - **Admin** → va a `/manage`.
  - **Empleado activo** → va a `/chat`.
  - **Empleado pendiente o rechazado** → se cierra la sesión y se muestra un mensaje explicando que su acceso aún no fue aprobado o fue rechazado.

### 3.3 Diagnóstico obligatorio en el primer acceso
- Mientras el usuario (empleado **o** admin) no haya rendido el diagnóstico, cualquier intento de entrar a `/chat`, `/dashboard`, `/manage`, `/admin` u `/org-dashboard` lo **redirige a `/diagnostic`**.
- Al completarlo se marca `diagnostic_done = true` en su cuenta y ya puede navegar libremente.

### 3.4 Control de acceso (cómo se aplica la lógica de roles)
La autorización se aplica en tres capas, siempre con el **estado vigente** de la cuenta (no el que tenía al iniciar sesión, así un empleado rechazado pierde acceso de inmediato):
1. **Endpoints de la API:** cada endpoint exige sesión, cuenta `active` y, si corresponde, rol `admin`. Es la protección real.
2. **Base de datos (RLS de Postgres):** cada usuario solo puede leer/escribir sus propios datos y solo si su cuenta está activa.
3. **Middleware de navegación:** refresca la sesión, expulsa a empleados no activos y fuerza el diagnóstico pendiente.

Los datos de autorización (rol, RUC, estado, diagnóstico hecho) se guardan en un área de la cuenta que **solo el servidor puede modificar**; los datos personales editables (nombre, teléfono, razón social) van en un área separada y nunca se usan para decidir permisos.

---

## 4. Módulos

### 4.1 Evaluación diagnóstica inicial (`/diagnostic`)

**Propósito:** establecer la **línea base** del conocimiento de cada usuario por tema. Contra ella se mide después la mejora.

**Cómo funciona:**
- Banco **fijo** de **16 preguntas**: **2 por cada uno de los 8 temas**, de opción múltiple, con escenarios realistas (ej.: "Recibes un correo del 'Banco de la Nación' que pide hacer clic en un enlace urgente…").
- La pantalla tiene una introducción, luego **un paso por temática** ("Temática 1 de 8", con barra de progreso) y al final los resultados.
- Las preguntas llegan al navegador **sin la respuesta correcta**; la calificación la hace el servidor.
- Reglas del servidor al calificar:
  - Se rinde **una sola vez** (si ya lo hizo, se rechaza): evita que alguien lo repita respondiendo mal a propósito para inflar su "mejora" posterior.
  - Deben responderse **exactamente las 16 preguntas**, sin repetir.
- **Resultado:** puntaje total, **desempeño por tema** (`{correctas, total}` por cada tema), y por cada pregunta: si acertó, cuál era la correcta y una **explicación**. La pantalla muestra **Fortalezas**, **Áreas a reforzar** y **Detalle por temática**.
- Se guarda en `diagnostic_results` y se marca el diagnóstico como completado.

### 4.2 Chat con IA (`/chat`, pestaña "Agente CyberChat")

**Propósito:** que cualquier usuario de la empresa pueda consultar dudas de ciberseguridad y recibir respuestas claras, accionables y basadas en las políticas de su propia empresa.

**Funciones de la interfaz:**
- **Conversaciones múltiples** en una barra lateral: crear nueva, abrir, **renombrar** y **eliminar**. Una conversación nueva se llama "Nuevo chat" y al enviar el primer mensaje toma como título los primeros 40 caracteres de la pregunta.
- **Historial persistente**: conversaciones y mensajes se guardan en la base de datos.
- **Atajos por tema** (ver Ruta de aprendizaje): botones que inician una conversación guiada sin que el usuario escriba nada.
- Cada respuesta basada en documentos lleva **citas numeradas** ([1], [2]…) y debajo la sección **«Fragmentos citados»**, que al abrirse muestra el documento y el texto de cada fragmento usado.
- Las respuestas se renderizan con formato: secciones (`###`), listas numeradas para pasos, viñetas para recomendaciones, bloques destacados de **ALERTA / IMPORTANTE** (advertencias críticas) y **Consejo** (buenas prácticas).

**Flujo de un mensaje (resumen):** el navegador guarda el mensaje del usuario → llama a `/api/chat` con el historial → el servidor ejecuta el pipeline RAG + LLM (sección 5) y devuelve la respuesta con sus fuentes y los fragmentos usados → el navegador guarda la respuesta del asistente junto con esos fragmentos (`messages.retrieved_contexts`), para volver a mostrar las citas al reabrir la conversación. Las políticas RLS solo permiten guardar mensajes en conversaciones propias y con la cuenta activa.

**Comportamiento del asistente (system prompt):**
- Se presenta como *"CyberChat, especialista en ciberseguridad para MYPES peruanas"*; responde en español claro, concreto y accionable, sin repetir la pregunta.
- **Alcance restringido:** solo ciberseguridad y concientización en seguridad de la información (amenazas, prevención, buenas prácticas, protección de datos, normativa como la Ley 29733, y uso de la plataforma). Si la consulta es de otro tema, **no la responde** y ofrece reformularla hacia ciberseguridad, aunque el usuario insista o lo plantee como juego de rol. Sí atiende saludos, agradecimientos y "¿qué puedes hacer?".
- **Con evidencia documental:** usa solo los fragmentos para las afirmaciones sobre la empresa y cita cada una como `[Fuente N]`; responde la parte que puede verificar y declara lo que no puede verificar; no inventa plazos, cifras, pasos ni responsables.
- **Sin evidencia y la pregunta es sobre políticas de la empresa:** no llama al modelo; responde *"No encontré evidencia suficiente para confirmar ese punto en los fragmentos disponibles. Verifica la política correspondiente con el administrador."*
- **Sin evidencia y es otra pregunta:** da orientación general de ciberseguridad, aclarando que no es una política verificada de la empresa.
- **Datos de otros usuarios:** si piden correos, contraseñas, contactos o resultados de otras personas, responde con un mensaje que explica su alcance. Si el modelo devuelve una negativa genérica («Lo siento, no puedo ayudar con eso»), el servidor la reemplaza por ese mismo mensaje.

### 4.3 Ruta de aprendizaje (dentro de `/chat`)

**Propósito:** guiar a cada empleado a reforzar primero lo que peor domina, usando el chat como tutor.

**Lógica:**
- Por cada tema se calcula el **% de aciertos del diagnóstico** y un **nivel de conocimiento**:
  - `alto` ≥ 75 % · `medio` 50–74 % · `bajo` < 50 %.
- Un tema es **débil** si su nivel no es alto.
- **Ruta** = temas débiles, ordenados del nivel más bajo al más alto (y luego por %).
- **Atajos** = los 8 temas, con los débiles primero.
- Cada tema tiene un ícono y un **prompt de arranque** predefinido. Ejemplo (phishing): *"Quiero reforzar mis conocimientos sobre phishing e ingeniería social. Explícame de forma sencilla qué es, cómo reconocer los ataques más comunes en una MYPE peruana y dame 3 preguntas cortas de refuerzo al final para practicar."*
- Al pulsar un tema: se crea una conversación titulada con el nombre del tema, se envía automáticamente el prompt de arranque al asistente y el tema pasa a estado **"En progreso"**.
- **Estados de progreso por tema:** `pendiente` → `en_progreso` → `completado`. Cuando el usuario **aprueba una evaluación con ≥ 60 %**, todos sus temas "en progreso" pasan a **"completado"**.
- El progreso se guarda en `learning_progress`.

### 4.4 Evaluaciones: post-test y recurrentes (`/chat`, pestaña "Evaluaciones")

**Propósito:** medir la evolución del conocimiento después del diagnóstico, de forma comparable y periódica.

**Banco de preguntas:** banco fijo de **200 preguntas** (25 por tema × 8 temas), con opciones, respuesta correcta y explicación. Cada evaluación tiene **16 preguntas: 2 por tema**, igual que el diagnóstico, para que los resultados sean comparables.

**Tipos de evaluación:**
- **Post-test:** la **primera** evaluación tras el diagnóstico.
- **Recurrente:** todas las siguientes. El tipo lo decide el servidor (si ya hay intentos previos, es recurrente).

**Armado de cada evaluación (anti-repetición):**
1. Por cada tema se toman preguntas **que el usuario aún no ha visto**, al azar.
2. Si en un tema ya no quedan suficientes sin ver, se **reinicia el ciclo de ese tema** completando con las vistas hace más tiempo.
3. Se mezclan las 16 preguntas y se envían **sin la respuesta correcta**.

**Calificación (servidor):**
- Requiere haber hecho el diagnóstico.
- Exige exactamente 16 respuestas, sin repetir, todas de preguntas activas del banco y con la composición **2 por cada tema** (evita armar un intento a medida con preguntas fáciles).
- Devuelve puntaje, desempeño por tema y, por pregunta, la correcta y su explicación.
- Guarda el intento (`evaluation_attempts`, con tipo y desempeño por tema; y `quiz_results`) y marca las preguntas como **vistas** (`seen_questions`).

**Recurrencia cada 5 días:**
- La recurrencia arranca después del primer post-test.
- Si pasaron **≥ 5 días** desde la última evaluación, corresponde una nueva:
  - **Empleado:** es **bloqueante** — no puede seguir usando el chat hasta rendirla.
  - **Admin:** se muestra como **recordatorio omitible**.
- Los dashboards muestran la fecha de la próxima evaluación y si está pendiente.

### 4.5 Dashboard personal (`/dashboard`)

**Propósito:** que cada usuario vea su nivel, su progreso y qué debe reforzar.

**Muestra:**
- **Nivel de riesgo** según su resultado más reciente (post-test/recurrente; si no hay, el diagnóstico): `bajo` ≥ 75 % · `medio` 50–74 % · `alto` < 50 %.
- **Comparativa de evaluaciones:** % del diagnóstico vs. % de la última evaluación y la **mejora en puntos**; historial de intentos con su tipo (post-test / recurrente).
- **Evaluación recurrente pendiente** y fecha de la próxima.
- **Desempeño por temática** (de la evaluación más reciente con detalle por tema, o del diagnóstico).
- **Fortalezas** (temas con todo correcto) y **Áreas a reforzar** (temas con algún error).
- **Uso del chatbot:** total de consultas realizadas y fecha de la última interacción.
- **Recomendaciones de IA** (dos tipos):
  - **3 recomendaciones breves** generadas por el LLM a partir de sus temas débiles y fuertes (si no tiene debilidades, 3 consejos avanzados).
  - **Tarjetas "Recomendado para ti"**: para sus **4 temas más débiles** del diagnóstico, el sistema busca (búsqueda vectorial, 3 fragmentos por tema) fragmentos de los documentos de su empresa sobre cada tema y le pide al LLM una tarjeta por tema con título motivador, resumen de qué aprender y por qué, **prioridad** (Alto < 50 %, Medio 50–74 %, Bajo ≥ 75 %) y una **pregunta sugerida** para hacerle al chatbot.

### 4.6 Gestión de empleados (`/manage`, solo admin)

**Propósito:** que el dueño controle quién accede a la plataforma.

- Lista de **todos los empleados registrados con el RUC de su empresa** (nunca de otras).
- Contadores: **Total, Activos, Pendientes, Rechazados** y gráfico de distribución de accesos.
- Acciones por empleado:
  - **Aprobar** → estado `active` (puede entrar).
  - **Rechazar** (con confirmación) → estado `rejected` (pierde acceso de inmediato, incluso con sesión abierta).
  - **Editar** nombres y apellidos.
- El servidor verifica que el empleado pertenezca a la empresa del admin antes de cualquier cambio.

### 4.7 Documentos RAG / base de conocimiento (`/admin`, solo admin)

**Propósito:** que el dueño cargue las políticas, manuales y procedimientos de su empresa para que el chat responda con base en ellos.

- **Subir documento:** PDF, DOCX o TXT, **máximo 10 MB**. Se procesa en el momento (ver Indexación, sección 5.1).
- **Mis documentos:** lista de documentos subidos con su cantidad de fragmentos.
- **Eliminar documento** (con confirmación): borra el archivo, el registro y sus fragmentos.
- **Reprocesar:** vuelve a leer los archivos originales, los fragmenta de nuevo y genera nuevos embeddings. Antes de reemplazar los fragmentos de cada documento guarda los anteriores en `rag_index_backups`; el reemplazo es atómico por documento, así que si uno falla conserva sus fragmentos.
- La base documental **pertenece a la empresa**: la sube el dueño y la consultan todos los empleados de ese RUC.

### 4.8 Dashboard organizacional (`/org-dashboard`, solo admin)

**Propósito:** dar al dueño una visión agregada del nivel de concientización de su personal para priorizar acciones.

**Métricas (sobre los empleados de su RUC):**
- **Totales:** empleados, activos, pendientes, rechazados, cuántos completaron el diagnóstico y **tasa de completitud** (completaron / activos).
- **Comparativa organizacional:** promedio del test inicial (diagnóstico) vs. promedio del post-test, y **mejora** en puntos porcentuales.
- **Índice general de concientización:** promedio de la última evaluación de cada empleado.
- **Tasa de cumplimiento:** % de empleados cuya última evaluación es ≥ 50 %.
- **Distribución de riesgo:** cuántos empleados en riesgo bajo / medio / alto.
- **Nivel de conocimiento por temática:** promedio organizacional por cada tema.
- **Áreas críticas:** los 3 temas con mayor % de errores.
- **Evaluación recurrente (cada 5 días):** promedio de la última recurrente, variación promedio respecto a la recurrente anterior, empleados **al día**, **atrasados** y **sin iniciar** (empleados activos que todavía no tienen post-test, tengan o no diagnóstico; los tres grupos suman el total de activos), y temas críticos según los últimos intentos.
- **Comparativa por período** (semana / mes / trimestre / histórico): promedio del período actual vs. el anterior del mismo tamaño.
- **Uso del chatbot:** total de consultas de los empleados.
- **Tabla de atención prioritaria:** hasta 15 empleados ordenados por riesgo (alto primero) y luego por peor diagnóstico, con su tema más débil, % diagnóstico / post-test y fecha de la última evaluación.

**Exportación CSV:**
- **Resumen organizacional:** todas las métricas anteriores + promedio por tema.
- **Detalle de empleados:** nombre, correo, estado, % diagnóstico, % post-test, nivel de riesgo, tema más débil, última evaluación y % por cada uno de los 8 temas.

**Resumen ejecutivo con IA:**
- El admin elige el período (última semana, último mes, último trimestre, histórico).
- Al LLM se le envían **solo datos agregados y anonimizados** (nunca nombres, correos ni IDs): índice de concientización, cumplimiento, promedios, cobertura, progreso, temas de mayor riesgo, desempeño por tema, grupos por riesgo y uso del chatbot.
- El LLM redacta (máx. ~450 palabras) un resumen con 5 secciones: **1)** nivel general de concientización, **2)** temas con mayor riesgo y su impacto, **3)** progreso organizacional (mejora, estancamiento o retroceso), **4)** grupos con mejor y peor desempeño (por nivel de riesgo, nunca por personas), **5)** 2–3 recomendaciones priorizadas.
- **Datos mínimos:** se necesita al menos 1 diagnóstico completado; si no, se muestra "Datos insuficientes para un resumen confiable".
- **Advertencias informativas** si los datos son parciales (ej.: aún no hay post-tests, o no hay período anterior para comparar).
- **Caché de 1 hora:** al abrir el dashboard se muestra el último resumen si tiene menos de 1 h; si no, se genera automáticamente. El botón de **regenerar** fuerza uno nuevo. Cada generación queda registrada (`org_summaries`) como caché y como **log de auditoría** (quién lo generó, cuándo y con qué métricas).

---

## 5. RAG e IA en detalle

### 5.1 Fase 1 — Indexación (cuando el admin sube un documento)

```
Archivo (PDF/DOCX/TXT, ≤ 10 MB)
  → Extraer texto (PDF: pdf-extraction · DOCX: mammoth · TXT: directo)
  → Limpiar texto (saltos de línea y espacios redundantes)
  → Fragmentar por secciones y oraciones (máx. 120 tokens por fragmento)
  → Generar un embedding por fragmento (vector de 384 dimensiones)
  → Guardar archivo en Storage, registro en `documents`
    y fragmentos con su vector en `document_chunks`
```

- **Fragmentación:** el texto se divide por títulos (`#`) y por oraciones. Cada fragmento empieza con «Documento: …» y, si corresponde, «Sección: …», y tiene como máximo **120 tokens** contados con el tokenizador del propio modelo de embeddings. Si cabe, repite la última oración corta (24 tokens o menos) del fragmento anterior. Las oraciones largas se reparten por palabras y se eliminan los fragmentos repetidos.
- **Sin recortes:** como ningún fragmento pasa de 120 tokens, el modelo de embeddings procesa el texto completo de cada uno.
- **Validaciones antes de guardar nada:** formato y tamaño, que haya texto legible (un PDF escaneado como imagen no lo tiene) y que salgan fragmentos aprovechables. Si algo falla a mitad del guardado, se revierte todo (no quedan documentos "vacíos").
- **Modelo de embeddings:** `paraphrase-multilingual-MiniLM-L12-v2` (Hugging Face), multilingüe, 384 dimensiones.
- **Almacenamiento vectorial:** PostgreSQL + `pgvector` en Supabase, con índice **HNSW** por distancia coseno.

### 5.2 Fase 2 — Consulta (cada mensaje del chat)

```
Pregunta del usuario (último mensaje)
  → Embedding de la pregunta (mismo modelo; si pasa de 120 tokens se divide
    en hasta 8 partes y se promedian sus vectores)
  → Identificar la empresa: RUC de la sesión → id del dueño de ese RUC
  → Búsqueda híbrida SOLO en documentos de esa empresa:
       vectorial (similitud coseno, 20 candidatos)
     + léxica de texto completo (8 con los términos más específicos y 20 con todos)
     → fusión RRF, sin duplicados, máx. 20 candidatos
  → Selección de evidencia: el LLM elige hasta 5 fragmentos que responden la pregunta
       (si falla: los 5 más similares de la búsqueda vectorial con similitud ≥ 0.38)
  → ¿Hay evidencia?
       Sí → system prompt con los fragmentos numerados; cada afirmación lleva [Fuente N]
       No, y la pregunta es sobre políticas de la empresa → respuesta fija, sin LLM
       No, y es otra pregunta → system prompt de orientación general
  → LLM con system prompt + últimos 12 mensajes de la conversación
  → Si la respuesta es una negativa genérica, se reemplaza por el mensaje de alcance
  → Respuesta + fuentes (documento, similitud y vista previa) + fragmentos usados
```

**Por qué funciona así:**
- **Mismo modelo en ambas fases:** solo así la cercanía entre vectores mide similitud de significado.
- **Búsqueda híbrida:** la vectorial encuentra fragmentos con el mismo significado aunque usen otras palabras; la léxica encuentra términos exactos (nombres de sistemas, cifras). Combinarlas reduce la evidencia que se pierde.
- **Selección con IA:** entre los candidatos se eligen los que realmente responden la pregunta, no solo los más parecidos.
- **Aislamiento por empresa:** la empresa se obtiene de la sesión del usuario, nunca de lo que envía el navegador; un usuario no puede recuperar documentos de otra empresa.
- **No inventar políticas:** una instrucción en el prompt no basta para que el modelo no invente una regla de la empresa; por eso, sin evidencia, las preguntas sobre políticas reciben una respuesta fija.
- **Historial de 12 mensajes:** da continuidad a la conversación sin crecer sin límite.
- **Citas visibles:** transparencia sobre en qué se basó cada afirmación.

### 5.3 Usos del LLM en la plataforma

Proveedor: **Groq**, modelo **`openai/gpt-oss-20b`** (rápido y de bajo costo; razona antes de responder, por eso se usa con esfuerzo de razonamiento "bajo").

| Uso | Dónde | Entrada | Salida | Temperatura |
|---|---|---|---|---|
| **Selección de evidencia (RAG)** | `/chat` | Pregunta + hasta 20 fragmentos candidatos | JSON con los ids de hasta 5 fragmentos | 0 |
| **Asistente conversacional (RAG)** | `/chat` | Fragmentos seleccionados + últimos 12 mensajes | Respuesta con citas `[Fuente N]` | 0.15 (muy factual) |
| **Recomendaciones breves** | `/dashboard` | Temas débiles y fuertes del usuario | 3 recomendaciones de 1–2 oraciones | 0.4 |
| **Tarjetas de aprendizaje** | `/dashboard` | 4 temas más débiles + fragmentos RAG de la empresa por tema | JSON con título, resumen, prioridad y pregunta sugerida por tema | 0.25 |
| **Resumen ejecutivo organizacional** | `/org-dashboard` | Métricas agregadas y anonimizadas del período | Informe de 5 secciones (≤ 450 palabras) | 0.3 |

---

## 6. Reglas de cálculo clave

| Concepto | Regla |
|---|---|
| % de un resultado | `round(correctas / total × 100)` |
| Nivel de riesgo (usuario y org.) | **Bajo** ≥ 75 % · **Medio** 50–74 % · **Alto** < 50 % |
| Nivel de conocimiento por tema (ruta) | **Alto** ≥ 75 % · **Medio** 50–74 % · **Bajo** < 50 % |
| Prioridad de tarjeta recomendada | **Alto** < 50 % · **Medio** 50–74 % · **Bajo** ≥ 75 % |
| Tema fuerte / débil (dashboard) | Fuerte = todas correctas · Débil = al menos un error |
| Mejora | % última evaluación − % diagnóstico (puntos porcentuales) |
| "Resultado actual" de un usuario | Última evaluación (post-test/recurrente); si no hay, el diagnóstico |
| Aprobar evaluación (ruta de aprendizaje) | ≥ 60 % → temas en progreso pasan a completado |
| Cumplimiento organizacional | Última evaluación ≥ 50 % |
| Recurrencia | Cada 5 días desde la última evaluación; bloqueante para empleados |
| Composición de cada evaluación | 16 preguntas = 2 × 8 temas |

---

## 7. Modelo de datos (resumen)

No hay tabla de empresas ni de perfiles: la identidad vive en las cuentas de Supabase Auth.

| Dónde | Qué guarda |
|---|---|
| Cuenta de usuario (datos protegidos) | Rol, RUC, estado de aprobación, diagnóstico completado |
| Cuenta de usuario (datos editables) | Nombres, apellidos, teléfono, razón social, nombre comercial |
| `diagnostic_results` | Resultado del diagnóstico: puntaje, total, desempeño por tema, fecha |
| `posttest_questions` | Banco de 200 preguntas (tema, enunciado, opciones, correcta, explicación, activa) |
| `evaluation_attempts` | Cada post-test/recurrente: tipo, puntaje, total, desempeño por tema, fecha |
| `quiz_results` | Registro paralelo de puntajes de evaluación (puntaje, total, fecha) |
| `seen_questions` | Preguntas del banco ya vistas por cada usuario (anti-repetición) |
| `learning_progress` | Estado de la ruta por usuario y tema (pendiente / en progreso / completado) |
| `conversations` | Conversaciones del chat por usuario (título) |
| `messages` | Mensajes de cada conversación (rol usuario/asistente, contenido, fecha); las respuestas guardan los fragmentos usados (`retrieved_contexts`) |
| `documents` | Documentos subidos por el dueño (nombre, ruta en Storage, quién lo subió) |
| `document_chunks` | Fragmentos de cada documento con su embedding de 384 dimensiones |
| `rag_index_backups` | Respaldo de los fragmentos anteriores de un documento cuando se reprocesa |
| `org_summaries` | Resúmenes IA organizacionales: caché + auditoría (RUC, período, texto, advertencias, métricas, autor, fecha) |
| `consent_records` | Consentimiento de cada usuario por finalidad (servicio, investigación) y versión de la política (Ley 29733) |
| `arco_requests` | Solicitudes de derechos ARCO con su plazo de respuesta en días hábiles |
| Storage `documents` | Archivos originales subidos |

El consentimiento se registra al crear la cuenta; las solicitudes ARCO y el consentimiento de investigación se gestionan desde `/mis-datos`, y la política se publica en `/privacidad`.

---

## 8. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework web | Next.js 16 (App Router) con endpoints API en el mismo proyecto |
| Interfaz | React 19 + Tailwind CSS 4 |
| Lenguaje | TypeScript |
| Base de datos | Supabase (PostgreSQL + pgvector) con Row Level Security |
| Autenticación | Supabase Auth (sesión por cookies) |
| Archivos | Supabase Storage |
| Embeddings | Hugging Face Inference — `paraphrase-multilingual-MiniLM-L12-v2` (384-dim) |
| LLM | Groq — `openai/gpt-oss-20b` |

---

## 9. Resumen en una frase por rol

- **Empleado:** se registra con el RUC de su empresa, espera aprobación, rinde un diagnóstico, aprende conversando con un asistente de IA que conoce las políticas de su empresa, sigue una ruta personalizada sobre sus temas débiles y se evalúa cada 5 días para medir su progreso.
- **Dueño (admin):** registra su empresa, aprueba a su personal, alimenta la base de conocimiento con sus documentos, y monitorea el nivel de concientización de la organización con métricas, reportes CSV y un resumen ejecutivo generado por IA.
