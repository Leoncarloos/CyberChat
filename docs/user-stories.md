# Historias de usuario

> **Numeración**: este archivo usa la numeración **oficial del Product Backlog académico**
> (`Historias_de_Usuario_Ciberseguridad_MYPEs_CORREGIDO.xlsx`, HU01–HU23, v2.0 septiembre 2026),
> no la numeración interna que este repo usó antes de reconciliarla (ver tabla de equivalencia).
> El Excel completo (con las HU01–HU07, HU09–HU10, HU12–HU15 de funcionalidad base: login,
> registro, chat, diagnóstico inicial, administración de documentos y de empleados) vive en
> `Historias_de_Usuario_Ciberseguridad_MYPEs_CORREGIDO.xlsx` — **no está commiteado al repo**
> por ser un entregable de tesis, no código. Este archivo solo detalla en formato BDD las
> historias que se documentaron durante el desarrollo iterativo del repo (Sprints 4–7).
>
> **Tabla de equivalencia** (numeración vieja del repo → numeración oficial):
>
> | Numeración vieja del repo | Numeración oficial | Nombre |
> |---|---|---|
> | HU21 | **HU08** | Recuperación de contraseña vía correo |
> | HU11 | **HU16** | Ruta de aprendizaje guiada en el chatbot |
> | HU17 | **HU17** | Resumen inteligente organizacional mediante IA (sin cambio) |
> | *(sin código previo, sin BDD)* | **HU18** | Resumen personalizado con IA (recomendaciones por empleado) — ya implementado, recién documentado aquí |
> | HU18 | **HU20** | Exportación CSV de resultados organizacionales y por empleado |
> | HU19 | **HU21** | Banco de preguntas fijo para el post-test + historial de notas |
> | HU20 | **HU22** | Evaluación recurrente cada 5 días |
> | — | **HU23** | Gestión de documentos de contexto para la IA (nueva, pedida en las Observaciones del backlog oficial — aún no tiene HU detallada en este archivo) |
>
> Nota: la **HU19 oficial** (gestión de roles, Escenario 3 = rol `platform_admin`) está
> pendiente de implementación, diferida a propósito por el usuario.

---

# Historia de Usuario — HU08

---

## Información General

| Campo                    | Detalle                                                        |
|--------------------------|-----------------------------------------------------------------|
| **Código**               | HU08                                                             |
| **Nombre**               | Recuperación de contraseña vía correo (Supabase Auth)           |
| **Usuario involucrado**  | Empleado / Administrador (cualquier usuario autenticable)       |
| **Prioridad**            | Alta                                                             |
| **Riesgo de desarrollo** | Bajo                                                             |
| **Puntos estimados**     | 3                                                                |
| **Puntos reales**        | —                                                                |
| **Recurso responsable**  | Development Team                                                 |
| **Iteración asignada**   | Sprint 7                                                          |

---

## Descripción

**Como** usuario que olvidó su contraseña de acceso a CyberChat,
**quiero** poder solicitar un enlace de recuperación a mi correo registrado y establecer una nueva contraseña desde ahí,
**para** recuperar el acceso a mi cuenta sin depender de que un administrador o soporte técnico intervenga manualmente.

---

## Contexto / Problema actual

- Hoy no existe ningún mecanismo de recuperación: si un usuario olvida su contraseña, no tiene forma de recuperarla desde la plataforma.
- Supabase Auth ya provee el flujo completo de recuperación por correo de forma nativa (`resetPasswordForEmail` + `updateUser`) — no requiere backend propio ni nueva tabla. Solo requiere 2 páginas nuevas en el frontend, un enlace en el login, y configuración de SMTP/plantilla de correo en el Dashboard de Supabase.
- Ya existe `lib/validators/auth.ts` con `passwordSchema` (política de contraseña) y `PasswordStrengthHint` (medidor visual) de HU de validación de login/register — se reutilizan aquí, no se duplican.

---

## Criterios de Aceptación

### Escenario 1 — Solicitud de recuperación desde el login

**Dado que** un usuario está en `/login` y no recuerda su contraseña,
**cuando** hace clic en "¿Olvidaste tu contraseña?",
**entonces** el sistema lo lleva a `/forgot-password`, donde puede ingresar su correo y solicitar el enlace de recuperación.

---

### Escenario 2 — Envío del correo sin revelar si la cuenta existe

**Dado que** un usuario ingresa un correo en `/forgot-password` y solicita el enlace,
**cuando** el sistema procesa la solicitud,
**entonces** siempre muestra el mismo mensaje de confirmación ("Si el correo existe, te enviamos un enlace de recuperación"), sin importar si ese correo tiene o no una cuenta registrada — para no permitir que alguien deduzca qué correos están registrados en la plataforma (mismo criterio de no revelar información aplicado en el login, HU de validación).

---

### Escenario 3 — Enlace de recuperación válido

**Dado que** el usuario recibió el correo y hace clic en el enlace dentro de su periodo de validez,
**cuando** el enlace lo redirige a `/reset-password`,
**entonces** el sistema le permite ingresar una nueva contraseña y su confirmación, aplicando la misma política de contraseña ya usada en registro (`passwordSchema`: 8+ caracteres, mayúscula, minúscula, número, carácter especial) con el mismo medidor visual (`PasswordStrengthHint`).

---

### Escenario 4 — Actualización exitosa

**Dado que** el usuario ingresó una nueva contraseña válida y coincidente en `/reset-password`,
**cuando** confirma el formulario,
**entonces** el sistema actualiza la contraseña vía `supabase.auth.updateUser()`, cierra la sesión de recuperación, y lo redirige a `/login` con un mensaje de éxito para iniciar sesión con la nueva clave.

---

### Escenario 5 — Enlace expirado o inválido

**Dado que** el usuario hace clic en un enlace de recuperación ya expirado o ya usado,
**cuando** `/reset-password` intenta procesar la sesión de recuperación,
**entonces** el sistema muestra un mensaje claro ("Este enlace ya no es válido") y un botón para volver a `/forgot-password` y solicitar uno nuevo, sin exponer detalles técnicos del error de Supabase.

---

### Escenario 6 — Recuperación no otorga acceso indebido

**Dado que** un empleado con `approval_status: "pending"` o `"rejected"` recupera su contraseña exitosamente,
**cuando** intenta iniciar sesión con la nueva contraseña,
**entonces** el sistema sigue aplicando la misma verificación de aprobación ya existente en `LoginClient.tsx` — recuperar la contraseña nunca otorga acceso por sí sola si la cuenta no está aprobada.

---

## Restricciones

- No se crea ninguna API route propia para enviar el correo — se usa `supabase.auth.resetPasswordForEmail()` directo desde el cliente, tal como ya se hace con `signInWithPassword()` en el login.
- La política de contraseña, la validación con Zod y el medidor de fuerza deben ser los mismos ya existentes en `lib/validators/auth.ts` y `components/PasswordStrengthHint.tsx` — no se duplican reglas.
- Requiere configuración manual (fuera del código) en el Dashboard de Supabase: `Authentication → URL Configuration` (agregar `/reset-password` a la allowlist de Redirect URLs) y, para producción, `Authentication → Emails → SMTP Settings` (el servicio de correo por defecto de Supabase es solo para pruebas, con límite muy bajo de envíos por hora).
- El mensaje de confirmación tras solicitar el enlace es siempre el mismo, exista o no la cuenta (anti user-enumeration).

---

## Notas Técnicas

- `app/(auth)/forgot-password/page.tsx` (nuevo): formulario con email, valida formato con `emailSchema`, llama a `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })`.
- `app/(auth)/reset-password/page.tsx` (nuevo): al montar, Supabase-js detecta automáticamente el token de recuperación en la URL y establece una sesión temporal; el formulario pide nueva contraseña + confirmación (reusa `passwordSchema` + `PasswordStrengthHint`), llama a `supabase.auth.updateUser({ password })`.
- `app/(auth)/login/LoginClient.tsx`: agregar enlace "¿Olvidaste tu contraseña?" apuntando a `/forgot-password`.
- Configuración de Supabase (Dashboard, no código): plantilla de correo "Reset Password" traducida a español; SMTP propio para producción; Redirect URLs actualizado.

---

# Historia de Usuario — HU16

---

## Información General

| Campo                | Detalle                                      |
|----------------------|----------------------------------------------|
| **Código**           | HU16                                         |
| **Nombre**           | Ruta de aprendizaje guiada en el chatbot     |
| **Usuario involucrado** | Empleado (usuario autenticado del sistema) |
| **Prioridad**        | Media                                        |
| **Riesgo de desarrollo** | Medio                                    |
| **Puntos estimados** | 5                                            |
| **Puntos reales**    | —                                            |
| **Recurso responsable** | Development Team                          |
| **Iteración asignada** | Sprint 4                                   |

---

## Descripción

**Como** empleado autenticado en la plataforma,  
**quiero** visualizar una ruta de aprendizaje personalizada dentro del chatbot, que identifique los temas de ciberseguridad en los que tengo un nivel de conocimiento bajo, y acceder a atajos temáticos que me permitan iniciar conversaciones dirigidas sobre dichos temas,  
**para** reforzar mis conocimientos en las áreas críticas de ciberseguridad de forma guiada, progresiva y sin fricción, contribuyendo a la concientización empresarial.

---

## Criterios de Aceptación

### Escenario 1 — Visualización de la ruta de aprendizaje personalizada

**Dado que** el empleado ha completado al menos una evaluación o interacción previa con el chatbot que permita determinar su nivel por tema,  
**cuando** el empleado ingresa al módulo del chatbot,  
**entonces** el sistema muestra una sección visible de "Tu ruta de aprendizaje" que lista los temas en los que el usuario tiene nivel bajo, ordenados por prioridad o relevancia, con un indicador visual del nivel actual (por ejemplo: bajo / medio / alto).

---

### Escenario 2 — Visualización de atajos temáticos

**Dado que** el empleado visualiza la interfaz del chatbot,  
**cuando** la pantalla principal del chat se carga correctamente,  
**entonces** el sistema muestra un conjunto de botones o chips de acceso rápido con los temas disponibles de ciberseguridad (ej.: *Phishing*, *Contraseñas seguras*, *Ingeniería social*, *Malware*, etc.), priorizando visualmente aquellos que corresponden a las áreas débiles del usuario.

---

### Escenario 3 — Selección de un tema desde los atajos

**Dado que** el empleado visualiza los atajos temáticos en el chatbot,  
**cuando** el empleado selecciona un tema específico,  
**entonces** el chatbot inicia automáticamente una conversación contextualizada sobre ese tema, presentando una introducción al contenido, preguntas de refuerzo o material de concientización, sin que el usuario necesite escribir ningún comando manualmente.

---

### Escenario 4 — Progreso dentro de la ruta de aprendizaje

**Dado que** el empleado completa una conversación o módulo sobre un tema de su ruta,  
**cuando** la interacción finaliza o se alcanza un umbral de respuestas correctas,  
**entonces** el sistema actualiza visualmente el estado del tema en la ruta (por ejemplo: de "pendiente" a "en progreso" o "completado") y refleja este avance en la próxima sesión del usuario.

---

### Escenario 5 — Sin datos suficientes para generar la ruta

**Dado que** el empleado ingresa al chatbot por primera vez o sin evaluaciones previas,  
**cuando** el sistema no dispone de datos suficientes para personalizar la ruta,  
**entonces** el chatbot muestra un mensaje informativo indicando que la ruta se generará tras completar una evaluación inicial, y ofrece al usuario la opción de iniciarla desde ese mismo momento.

---

## Restricciones

- La ruta de aprendizaje y los atajos temáticos deben mostrar **únicamente contenido relacionado con ciberseguridad y concientización empresarial**. No se debe incluir contenido externo, genérico o no validado por el equipo de contenido.
- Los temas mostrados deben provenir de un **catálogo de contenidos controlado y aprobado** por el área de seguridad de la organización.
- El nivel del usuario por tema debe calcularse a partir de **datos reales de interacciones o evaluaciones previas** registradas en el sistema; no debe asignarse de forma aleatoria ni estática.
- La personalización de la ruta debe **respetar el rol y el perfil del empleado**; un empleado sin interacciones previas no debe ver una ruta vacía sin orientación.
- El componente de atajos temáticos debe ser **accesible** (navegable por teclado, con etiquetas descriptivas para lectores de pantalla).

---

## Notas Técnicas

- La lógica de cálculo de nivel por tema puede consumirse desde un endpoint existente o nuevo del backend; el equipo de frontend debe coordinarse con backend para definir el contrato de la API.
- Los atajos temáticos pueden implementarse como componentes reutilizables tipo `<TopicChip />` que reciban el tema, el nivel y un handler de selección como props.
- Se recomienda aplicar **skeleton loaders** mientras se obtiene la ruta personalizada del servidor, para evitar saltos visuales en la carga.
- El estado del progreso de la ruta debe persistir entre sesiones (no reiniciarse al cerrar el navegador).

---

## Definición de Terminado (Definition of Done)

- [ ] El empleado visualiza su ruta de aprendizaje con los temas de nivel bajo identificados.
- [ ] Los atajos temáticos se muestran en la interfaz del chatbot al iniciar sesión.
- [ ] Al seleccionar un atajo, el chatbot inicia la conversación contextualizada sin intervención manual del usuario.
- [ ] El progreso del usuario se actualiza tras completar una interacción.
- [ ] El escenario de primer uso (sin datos previos) está cubierto con mensaje y CTA.
- [ ] Los componentes son accesibles (WCAG AA mínimo).
- [ ] Se han escrito pruebas unitarias para los componentes de ruta y atajos.
- [ ] El equipo de QA validó todos los escenarios de aceptación en ambiente de staging.



# Historia de Usuario — HU17

---

## Información General

| Campo                    | Detalle                                              |
|--------------------------|------------------------------------------------------|
| **Código**               | HU17                                                 |
| **Nombre**               | Resumen inteligente organizacional mediante IA       |
| **Usuario involucrado**  | Administrador del sistema                            |
| **Prioridad**            | Media                                                |
| **Riesgo de desarrollo** | Medio                                                |
| **Puntos estimados**     | 5                                                    |
| **Puntos reales**        | —                                                    |
| **Recurso responsable**  | Development Team                                     |
| **Iteración asignada**   | Sprint 4                                             |

---

## Descripción

**Como** administrador de la plataforma,  
**quiero** que la IA genere automáticamente un resumen ejecutivo e interpretativo de los dashboards y resultados organizacionales en materia de ciberseguridad,  
**para** identificar de forma rápida y clara los riesgos activos, el nivel de avance de la organización y las oportunidades de mejora, sin necesidad de analizar manualmente cada métrica del dashboard, facilitando la toma de decisiones estratégicas.

---

## Criterios de Aceptación

### Escenario 1 — Generación automática del resumen ejecutivo

**Dado que** el administrador accede al dashboard organizacional y existen datos suficientes para el período analizado,  
**cuando** el sistema carga la vista del dashboard,  
**entonces** la IA genera y muestra automáticamente un resumen ejecutivo que incluye, como mínimo:

- **Nivel general de concientización:** porcentaje o índice agregado de la organización con interpretación cualitativa (ej.: *"El nivel general es medio-alto, con un 72% de empleados en zona de cumplimiento"*).
- **Temas con mayor riesgo:** listado de los temas o módulos donde el promedio organizacional es más bajo, con una breve explicación del impacto potencial.
- **Progreso organizacional:** comparativa respecto al período anterior (semana, mes o trimestre configurable), indicando si hay mejora, estancamiento o retroceso.
- **Grupos con mejor y peor desempeño:** identificados por área, departamento o rol —nunca por nombre individual— para proteger la privacidad de los usuarios.

---

### Escenario 2 — Resumen generado bajo demanda

**Dado que** el administrador ya visualiza el dashboard organizacional,  
**cuando** el administrador hace clic en el botón "Generar resumen IA" o equivalente,  
**entonces** el sistema lanza una nueva generación del resumen con los datos actualizados al momento de la solicitud, reemplazando el resumen anterior, y muestra la fecha y hora de la última generación.

---

### Escenario 3 — Datos insuficientes para generar el resumen

**Dado que** el administrador accede al dashboard pero el período seleccionado tiene datos insuficientes (menos del umbral mínimo de registros requeridos),  
**cuando** el sistema intenta generar el resumen,  
**entonces** el sistema muestra un mensaje informativo que indica que no hay suficientes datos para generar un resumen confiable, especificando qué condición no se cumple (ej.: *"Se requieren al menos 1 evaluación completada en el período"*), y no genera un resumen parcial ni incorrecto.

---

### Escenario 4 — Indicador de carga durante la generación

**Dado que** el administrador solicita la generación del resumen,  
**cuando** la IA está procesando la información,  
**entonces** el sistema muestra un indicador visual de carga (skeleton loader o spinner con mensaje contextual como *"Analizando resultados organizacionales…"*) y bloquea el botón de generación para evitar solicitudes duplicadas, hasta que el resumen esté disponible.

---

### Escenario 5 — Error en la generación del resumen

**Dado que** el administrador solicita la generación del resumen,  
**cuando** ocurre un error en la comunicación con el servicio de IA o en el procesamiento de los datos,  
**entonces** el sistema muestra un mensaje de error claro y accionable (ej.: *"No fue posible generar el resumen. Por favor, intenta nuevamente o contacta al soporte técnico."*), sin exponer detalles técnicos del error al usuario.

---

### Escenario 6 — Acceso restringido por rol

**Dado que** un usuario con rol distinto a Administrador intenta acceder a la vista del resumen organizacional (ya sea por URL directa u otro medio),  
**cuando** el sistema valida el rol del usuario autenticado,  
**entonces** el sistema deniega el acceso y redirige al usuario a su vista correspondiente, sin mostrar ningún fragmento del resumen ni de los datos organizacionales agregados.

---

## Restricciones

- El resumen generado **no debe exponer información identificable de usuarios individuales** (nombres, correos, cédulas u otros datos personales). Los análisis de desempeño deben presentarse siempre a nivel de grupo, área o departamento.
- El resumen y el dashboard organizacional son accesibles **exclusivamente para usuarios con rol Administrador**, validado tanto en frontend (guards de ruta) como en backend (autorización por token/rol).
- La IA debe basar el resumen **únicamente en los datos internos de la plataforma** para el período seleccionado; no debe consumir ni inferir información externa.
- El resumen generado **no sustituye los datos del dashboard**; es un complemento interpretativo. Los datos fuente siempre deben estar disponibles para que el administrador los consulte directamente.
- El contenido del resumen debe estar **limitado al dominio de ciberseguridad y concientización empresarial**; la IA no debe derivar hacia recomendaciones fuera de este alcance.
- Se debe registrar en **log de auditoría** cada generación de resumen: quién lo solicitó, cuándo y sobre qué período de datos.

---

## Notas Técnicas

- La generación del resumen debe realizarse a través de una llamada al servicio de IA (LLM) desde el backend, enviando únicamente datos agregados y anonimizados; **el frontend nunca debe enviar datos al servicio de IA directamente**.
- Se recomienda implementar un mecanismo de **caché del resumen** (ej.: TTL de 1 hora o hasta nueva generación manual) para evitar llamadas innecesarias al servicio de IA en cada carga del dashboard.
- El contrato de la API debe incluir: `resumen_texto`, `fecha_generacion`, `periodo_analizado`, `advertencias` (si los datos son parciales).
- El componente visual del resumen debe implementarse como `<OrganizationalSummary />`, recibiendo el texto y la metadata como props, con soporte para estado de carga, error y vacío.
- Considerar límite de tokens en la respuesta del LLM para garantizar que el resumen sea conciso (recomendado: máximo 400-500 palabras).

---

## Definición de Terminado (Definition of Done)

- [ ] El resumen ejecutivo se genera automáticamente al cargar el dashboard con datos suficientes.
- [ ] El resumen se puede regenerar manualmente bajo demanda con datos actualizados.
- [ ] Los escenarios de datos insuficientes y error están cubiertos con mensajes claros al usuario.
- [ ] Ningún dato personal identificable aparece en el resumen generado (validado por QA).
- [ ] El acceso está restringido por rol en frontend y backend (validado con pruebas de autorización).
- [ ] El indicador de carga se muestra correctamente durante la generación.
- [ ] Cada generación queda registrada en el log de auditoría.
- [ ] El componente es accesible (WCAG AA mínimo).
- [ ] Se han escrito pruebas unitarias para el componente y pruebas de integración para el endpoint.
- [ ] El equipo de QA validó todos los escenarios de aceptación en ambiente de staging.



# Historia de Usuario — HU18

---

## Información General

| Campo                    | Detalle                                                        |
|--------------------------|-----------------------------------------------------------------|
| **Código**               | HU18                                                             |
| **Nombre**               | Resumen personalizado con IA en el dashboard del empleado        |
| **Usuario involucrado**  | Empleado (usuario autenticado del sistema)                      |
| **Prioridad**            | Media                                                            |
| **Riesgo de desarrollo** | Medio                                                            |
| **Puntos estimados**     | 5                                                                |
| **Puntos reales**        | —                                                                |
| **Recurso responsable**  | Development Team                                                 |
| **Iteración asignada**   | Sprint 5                                                          |

---

## Descripción

**Como** empleado que ya completó el diagnóstico inicial,
**quiero** que la plataforma me muestre en mi dashboard recomendaciones de aprendizaje generadas por IA y personalizadas según mis temas más débiles —incluyendo, cuando existan, contenido extraído de los documentos internos de mi propia empresa—,
**para** saber exactamente en qué reforzarme y poder continuar la conversación con el chatbot sobre ese tema específico sin tener que adivinar qué preguntar.

---

## Contexto / Problema actual (implementación existente en el repo)

Esta historia ya está implementada en código bajo dos mecanismos complementarios, sin que
existiera hasta ahora una HU documentada para ninguno de los dos:

- `GET /api/dashboard` calcula `strongTopics`/`weakTopics` a partir del intento de evaluación
  más reciente con detalle por tema (o el diagnóstico inicial como fallback) y genera, vía
  Groq, **3 recomendaciones de texto libre** (campo `recommendations: string[]`) basadas
  únicamente en esos temas — sin RAG, sin estructura de tarjeta. Se muestran en la sección
  "Recomendaciones personalizadas" del dashboard.
- `GET /api/recommendations` toma los **4 temas más débiles** del diagnóstico más reciente
  del empleado y, por cada uno, busca contexto real vía RAG (`match_document_chunks_scoped`)
  en los documentos subidos por el administrador de la **misma organización** (`ruc`
  coincidente); con ese contexto (o conocimiento general si la empresa no subió documentos
  sobre ese tema) arma un prompt a Groq que devuelve tarjetas estructuradas
  (`RecommendationCard`: `topicKey`, `topicLabel`, `title`, `summary`, `priority`,
  `suggestedPrompt`). Se muestran en la sección "Recomendado para ti · IA · RAG", con un
  botón que abre `/chat?q=<suggestedPrompt>` para continuar la conversación dirigida.

---

## Criterios de Aceptación

### Escenario 1 — Generación automática al cargar el dashboard

**Dado que** un empleado con diagnóstico inicial completado visita `/dashboard`,
**cuando** la página termina de cargar los datos base (`GET /api/dashboard`),
**entonces** el sistema dispara automáticamente `GET /api/recommendations` y muestra, sin
acción adicional del usuario, tanto el bloque de "Recomendaciones personalizadas" (texto)
como el de "Recomendado para ti" (tarjetas por tema).

---

### Escenario 2 — Recomendaciones enriquecidas con documentos de la empresa (RAG)

**Dado que** el administrador de la organización del empleado (mismo `ruc`) subió documentos
relacionados con alguno de los temas más débiles del empleado,
**cuando** `/api/recommendations` arma la tarjeta de ese tema,
**entonces** el contexto usado en el prompt a la IA incluye fragmentos reales de esos
documentos (top-3 chunks vía `match_document_chunks_scoped`, aislados por el `user_id` del
administrador), y el `summary` generado refleja ese contenido específico de la empresa.

---

### Escenario 3 — Sin documentos de la empresa para un tema

**Dado que** la organización del empleado no tiene documentos relevantes para alguno de sus
temas débiles (o no tiene ningún documento subido),
**cuando** `/api/recommendations` arma la tarjeta de ese tema,
**entonces** el sistema genera la recomendación usando conocimiento general de ciberseguridad
para MYPES peruanas (sin fallar ni mostrar un hueco vacío), sin exponer al usuario que faltó
contexto documental.

---

### Escenario 4 — Priorización visual por nivel de dominio

**Dado que** las tarjetas de recomendación se generan para los 4 temas más débiles del
empleado,
**cuando** se muestran en el dashboard,
**entonces** cada tarjeta indica una prioridad (`Alto` si el dominio del tema es menor a 50%,
`Medio` entre 50% y 74%, `Bajo` desde 75%), con color e indicador visual distintos por nivel,
y ordenadas de la más débil a la más fuerte.

---

### Escenario 5 — Indicador de carga mientras se generan las tarjetas

**Dado que** el empleado tiene diagnóstico completado y el dashboard ya cargó sus datos base,
**cuando** `/api/recommendations` todavía está procesando la respuesta de la IA,
**entonces** el sistema muestra un indicador de carga ("Generando recomendaciones
personalizadas...") en el bloque "Recomendado para ti", sin bloquear el resto del dashboard.

---

### Escenario 6 — Continuar la conversación desde una recomendación

**Dado que** el empleado ve una tarjeta de recomendación con su `suggestedPrompt`,
**cuando** hace clic en "Consultar con el chatbot",
**entonces** el sistema lo navega a `/chat` con la pregunta sugerida precargada
(`/chat?q=<suggestedPrompt>`), iniciando la conversación dirigida sobre ese tema sin que el
usuario tenga que redactarla manualmente.

---

### Escenario 7 — Sin diagnóstico previo

**Dado que** un empleado aún no completó el diagnóstico inicial,
**cuando** visita `/dashboard`,
**entonces** el sistema **no** llama a `/api/recommendations` ni muestra el bloque
"Recomendado para ti"; `/api/recommendations` devuelve `{ recommendations: [], reason:
"no_diagnostic" }` si se invoca directamente.

---

### Escenario 8 — Error o respuesta inválida de la IA

**Dado que** el servicio de IA devuelve una respuesta que no se puede interpretar como JSON
válido, o la llamada falla,
**cuando** `/api/recommendations` procesa la respuesta,
**entonces** el sistema devuelve una lista vacía de recomendaciones (`reason: "parse_error"`
o error controlado) y el dashboard muestra el mensaje "No se pudieron generar
recomendaciones. Intenta más tarde." en vez de romper la página o mostrar una tarjeta
corrupta.

---

## Restricciones

- Las recomendaciones RAG **solo usan documentos de la organización del propio empleado**
  (aislamiento por `ruc`, resolviendo primero el `user_id` del administrador con ese `ruc` y
  filtrando `match_document_chunks_scoped` por ese `user_id`); nunca cruzan datos entre
  organizaciones.
- El contenido generado debe mantenerse **dentro del dominio de ciberseguridad y
  concientización empresarial** (restricción impuesta en el prompt, igual que en HU17).
- Solo se generan tarjetas para los **4 temas de menor desempeño**; no se generan
  recomendaciones para temas ya dominados.
- El bloque de texto simple (`/api/dashboard` → `recommendations: string[]`) y el bloque de
  tarjetas RAG (`/api/recommendations`) son **independientes entre sí**: un fallo en uno no
  debe impedir que el otro se muestre.
- Ninguno de los dos mecanismos expone datos personales de otros empleados ni de otras
  organizaciones.

---

## Notas Técnicas

- Endpoints involucrados: `GET /api/dashboard` (campo `recommendations: string[]`, 3 líneas
  de texto sin estructura) y `GET /api/recommendations` (`RecommendationCard[]`, con RAG).
  Ambos usan el modelo Groq `qwen/qwen3.8-27b`.
- `app/api/recommendations/route.ts`: obtiene el último `diagnostic_results` del usuario,
  ordena `diagnosticTopics` por `%` ascendente y toma los 4 más débiles, resuelve el admin de
  la misma `ruc` vía `auth.admin.listUsers`, y por tema hace `embedHF` + RPC
  `match_document_chunks_scoped` (top-3, `match_count: 3`) antes de armar el prompt.
- `app/dashboard/page.tsx`: dispara `fetch("/api/recommendations")` en el mismo `useEffect`
  que carga `/api/dashboard`, mostrando el estado de carga (`recsLoading`) por separado.
- No hay caché para `/api/recommendations` (a diferencia de `org_summaries` en HU17); se
  regenera en cada carga del dashboard.

---

# Historia de Usuario — HU20

---

## Información General

| Campo                    | Detalle                                                        |
|--------------------------|-----------------------------------------------------------------|
| **Código**               | HU20                                                             |
| **Nombre**               | Exportación CSV de resultados organizacionales y por empleado   |
| **Usuario involucrado**  | Administrador del sistema                                       |
| **Prioridad**            | Media                                                            |
| **Riesgo de desarrollo** | Bajo                                                             |
| **Puntos estimados**     | 3                                                                |
| **Puntos reales**        | —                                                                |
| **Recurso responsable**  | Development Team                                                 |
| **Iteración asignada**   | Sprint 5                                                          |

---

## Descripción

**Como** administrador de la plataforma,  
**quiero** descargar en formato CSV los resultados organizacionales agregados y el detalle de resultados por cada empleado de mi organización,  
**para** analizar, reportar o auditar la información de concientización en ciberseguridad fuera de la plataforma, sin exponer datos de otras organizaciones.

---

## Criterios de Aceptación

### Escenario 1 — Botón visible solo para admin en org-dashboard

**Dado que** un administrador con RUC configurado accede a `/org-dashboard`,  
**cuando** la vista carga correctamente,  
**entonces** el sistema muestra un botón "Exportar CSV" (o dos botones: "Exportar resumen organizacional" y "Exportar por empleado") visible únicamente para rol `admin`.

---

### Escenario 2 — Descarga de resultados organizacionales agregados

**Dado que** el administrador hace clic en "Exportar resumen organizacional",  
**cuando** el sistema procesa la solicitud,  
**entonces** se descarga un archivo `.csv` con las métricas agregadas de su organización (totales de empleados, tasa de completitud, promedio por tema, etc.), delimitado por RUC del administrador autenticado.

---

### Escenario 3 — Descarga de resultados por empleado

**Dado que** el administrador hace clic en "Exportar por empleado",  
**cuando** el sistema procesa la solicitud,  
**entonces** se descarga un archivo `.csv` con una fila por empleado de su organización (nombre, correo, estado, score diagnóstico, score quiz, nivel por tema, última actividad), incluyendo únicamente empleados con `ruc` igual al del administrador.

---

### Escenario 4 — Aislamiento entre organizaciones

**Dado que** un administrador de la organización A solicita cualquiera de las exportaciones,  
**cuando** el backend arma el CSV,  
**entonces** solo se incluyen datos cuyo `ruc` coincide con el del administrador autenticado; ningún dato de otra organización aparece en el archivo, incluso si se manipula el request.

---

### Escenario 5 — Sin datos suficientes

**Dado que** la organización no tiene empleados o resultados registrados,  
**cuando** el administrador solicita la exportación,  
**entonces** el sistema muestra un mensaje informativo ("No hay datos para exportar") y no genera un archivo vacío o corrupto.

---

### Escenario 6 — Acceso restringido por rol

**Dado que** un usuario con rol `employee` intenta invocar el endpoint de exportación directamente (URL o request manual),  
**cuando** el backend valida el rol,  
**entonces** responde `403` y no se genera ni entrega ningún archivo.

---

## Restricciones

- Los botones de exportación **solo son visibles en `/org-dashboard`** y solo para rol `admin`.
- El CSV **no debe incluir empleados de otra organización**; el filtrado por `ruc` se valida en backend, nunca solo en frontend.
- El CSV por empleado puede incluir datos identificables (nombre, correo) ya que es un reporte interno de la propia organización — a diferencia del resumen IA (HU17), que sí anonimiza.
- La generación del CSV se hace en el servidor (API route), no se arma en el cliente a partir de datos ya cargados sin re-validar sesión/rol.
- Codificación `UTF-8` con BOM para compatibilidad con Excel en caracteres especiales (tildes, ñ).

---

## Notas Técnicas

- Nuevos endpoints sugeridos: `/api/org-dashboard/export` (resumen agregado) y `/api/org-dashboard/export-employees` (detalle por empleado), ambos `GET`, validando `supabaseServer().auth.getUser()` + `role === "admin"` + `ruc` como en `route.ts` (`app/api/org-dashboard/route.ts`).
- Reutilizar `computeOrgMetrics(adminRuc)` de `lib/orgMetrics.ts` para el CSV agregado; para el detalle por empleado, reutilizar la misma query de empleados scopeada por `ruc` ya presente ahí.
- Respuesta con headers `Content-Type: text/csv; charset=utf-8` y `Content-Disposition: attachment; filename="..."`.
- Botones en `org-dashboard/page.tsx` disparan `fetch` + blob download, sin exponer lógica de agregación en cliente.

---

## Definición de Terminado (Definition of Done)

- [ ] Botón(es) de exportación visibles solo en `/org-dashboard` para rol `admin`.
- [ ] CSV organizacional agregado se descarga correctamente con datos scopeados por RUC.
- [ ] CSV por empleado se descarga correctamente, un empleado por fila, scopeado por RUC.
- [ ] Intento de acceso con rol `employee` responde `403` sin generar archivo.
- [ ] Caso sin datos muestra mensaje informativo, sin archivo vacío.
- [ ] Validado que no hay fuga de datos entre organizaciones (prueba con 2 RUCs distintos).
- [ ] Pruebas de integración para ambos endpoints.
- [ ] QA validó escenarios en staging.

---

# Historia de Usuario — HU21

---

## Información General

| Campo                    | Detalle                                                                 |
|--------------------------|----------------------------------------------------------------------------|
| **Código**               | HU21                                                                      |
| **Nombre**               | Banco de preguntas fijo para el POST TEST + historial de notas evolutivo |
| **Usuario involucrado**  | Empleado (rinde el post-test) / Administrador (consulta evolución)       |
| **Prioridad**            | Alta                                                                      |
| **Riesgo de desarrollo** | Medio                                                                     |
| **Puntos estimados**     | 8                                                                         |
| **Puntos reales**        | —                                                                         |
| **Recurso responsable**  | Development Team                                                         |
| **Iteración asignada**   | Sprint 6                                                                  |

---

## Descripción

**Como** empleado que ya completó el diagnóstico inicial y usó el chatbot,
**quiero** rendir un post-test con la misma cantidad de preguntas que el diagnóstico inicial, extraídas de un banco fijo de preguntas (no generadas en vivo por IA en cada intento), y conservar un historial de mis notas a lo largo del tiempo,
**para** que el post-test mida de forma consistente y comparable mi evolución respecto al diagnóstico inicial, y pueda ver cómo mejoro en cada tema tras usar el chatbot.

---

## Contexto / Problema actual

- El diagnóstico inicial (`lib/diagnosticQuestions.ts`) es un banco **fijo y hardcodeado** de 8 temas × 2 preguntas = **16 preguntas totales**.
- El post-test (`app/api/posttest/route.ts`) **genera 10 preguntas nuevas en cada intento** vía Groq (`llama-3.1-8b-instant`), en tiempo real, sin persistir el banco. Esto rompe la comparabilidad: cantidad distinta (10 vs 16), preguntas distintas cada vez, y sin garantía de que cubran los mismos temas del diagnóstico.
- `quiz_results` guarda `score` y `total` por intento (sí permite ver histórico de notas en el tiempo), pero no guarda el detalle por pregunta/tema, por lo que no se puede comparar avance tema por tema contra el diagnóstico inicial.

---

## Criterios de Aceptación

### Escenario 1 — Banco de 200 preguntas cargado en base de datos

**Dado que** se ejecuta la migración de la tabla `posttest_questions`,
**cuando** se inyectan las preguntas generadas,
**entonces** existen exactamente **200 preguntas** activas en la tabla, distribuidas equitativamente entre los **8 temas del diagnóstico inicial** (`phishing`, `ia_amenazas`, `canales_venta`, `contrasenas`, `accesos`, `ley_29733`, `datos_sensibles`, `resiliencia`), es decir **25 preguntas por tema**.

---

### Escenario 2 — El post-test extrae la misma cantidad de preguntas que el pre-test

**Dado que** un empleado con `diagnostic_done = true` solicita el post-test (`GET /api/posttest`),
**cuando** el backend arma el cuestionario,
**entonces** selecciona aleatoriamente **2 preguntas por cada uno de los 8 temas** desde `posttest_questions` (16 preguntas totales, igual a `totalQuestions` del diagnóstico), en vez de generarlas con Groq en vivo.

---

### Escenario 3 — Variedad entre intentos sin generación en vivo

**Dado que** un empleado rinde el post-test más de una vez,
**cuando** el sistema arma cada intento,
**entonces** las preguntas se seleccionan al azar dentro del pool de 25 por tema (evitando repetir el mismo set exacto en intentos consecutivos cuando sea posible), sin llamar a Groq para generar contenido nuevo.

---

### Escenario 4 — Historial de notas por intento

**Dado que** un empleado completa un post-test,
**cuando** el resultado se guarda (`POST /api/quiz`),
**entonces** se registra una nueva fila en `quiz_results` (no se sobrescribe la anterior) con `score`, `total` y `taken_at`, de modo que el histórico completo de intentos queda disponible para ese usuario.

---

### Escenario 5 — Visualización de evolución en el dashboard

**Dado que** un empleado tiene 2 o más resultados de post-test guardados,
**cuando** visita `/dashboard`,
**entonces** puede ver su evolución de notas en el tiempo (lista u ordenado cronológicamente), no solo el último resultado.

---

### Escenario 6 — Post-test sin banco disponible

**Dado que** la tabla `posttest_questions` no tiene preguntas activas para algún tema (caso de error de datos),
**cuando** el empleado solicita el post-test,
**entonces** el sistema responde con error controlado (no genera preguntas improvisadas con IA como fallback silencioso) y registra el problema para revisión del administrador técnico.

---

## Restricciones

- El post-test **deja de generar preguntas en vivo con Groq**; pasa a ser un banco fijo persistido en Supabase, igual que el diagnóstico.
- La cantidad de preguntas por intento de post-test **debe ser idéntica** a `totalQuestions` del diagnóstico inicial (16), no un número fijo distinto.
- Los temas del banco de post-test deben ser **exactamente los mismos 8 `topic_key`** usados en `diagnosticTopics`, para permitir comparación de aprendizaje evolutivo tema por tema.
- `quiz_results` se mantiene **append-only** (nunca update/delete de intentos previos) para preservar el historial real de notas.
- Las 200 preguntas se redactan con el mismo estilo y nivel práctico que el diagnóstico (contexto MYPE peruana), evitando duplicados o near-duplicados dentro de un mismo tema.

---

## Notas Técnicas

- Nueva tabla `posttest_questions`: `id uuid`, `topic_key text` (FK lógica a los keys de `diagnosticTopics`), `question text`, `options jsonb` (4 opciones), `correct_index int`, `explanation text`, `active boolean default true`, `created_at timestamptz default now()`. SQL en `docs/sql/posttest_questions.sql`.
- `app/api/posttest/route.ts` se reescribe para: 1) leer `topic_key` válidos, 2) por cada uno, `SELECT ... WHERE topic_key = X AND active ORDER BY random() LIMIT 2`, 3) devolver 16 preguntas mezcladas (sin exponer `correct_index` al cliente si se quiere evitar trampa, evaluando en backend — a definir con `/api/quiz`).
- Las 200 preguntas se generan una única vez (offline, por este mismo asistente) y se inyectan vía migración/seed SQL — no en runtime.
- Dashboard (`app/dashboard/page.tsx`, `app/api/dashboard/route.ts`) se ajusta para leer todas las filas de `quiz_results` del usuario (no solo la última) y mostrar evolución.

---

# Historia de Usuario — HU22

---

## Información General

| Campo                    | Detalle                                                                      |
|--------------------------|-------------------------------------------------------------------------------|
| **Código**               | HU22                                                                           |
| **Nombre**               | Evaluación recurrente cada 5 días con preguntas no repetidas y seguimiento de áreas críticas |
| **Usuario involucrado**  | Empleado (rinde la evaluación) / Administrador (monitorea evolución organizacional) |
| **Prioridad**            | Alta                                                                           |
| **Riesgo de desarrollo** | Medio-Alto                                                                     |
| **Puntos estimados**     | 13                                                                             |
| **Puntos reales**        | —                                                                              |
| **Recurso responsable**  | Development Team                                                              |
| **Iteración asignada**   | Sprint 6                                                                       |

---

## Descripción

**Como** empleado que ya completó el diagnóstico inicial y el post-test,
**quiero** que la plataforma me presente automáticamente una nueva evaluación cada 5 días de acceso, compuesta por preguntas del banco que aún no he respondido en evaluaciones anteriores,
**para** mantener una medición continua de mi nivel de concientización, identificar mis áreas críticas y evidenciar mi mejora a lo largo del tiempo, tanto en mi dashboard personal como en el dashboard organizacional de mi empresa.

---

## Contexto / Problema actual

- El ciclo de evaluación actual termina en el post-test (HU21), diagnóstico inicial → uso del chatbot → post-test. Después de eso, no existe ningún mecanismo que vuelva a medir al empleado, por lo que la concientización no se refuerza ni se monitorea en el tiempo.
- El banco de 200 preguntas (`posttest_questions`, 25 por tema × 8 temas) ya existe y soporta esta funcionalidad: cada evaluación de 16 preguntas consume solo el 8% del banco, permitiendo ~12 evaluaciones sin repetir preguntas por usuario.
- `quiz_results` guarda score/total/fecha pero no distingue tipo de evaluación ni desempeño por tema, por lo que hoy no se pueden identificar "áreas críticas" en evaluaciones posteriores al diagnóstico.

---

## Criterios de Aceptación

### Escenario 1 — Activación de la evaluación recurrente al ingresar

**Dado que** un empleado con post-test completado inicia sesión en la plataforma,
**cuando** han transcurrido **5 días o más** desde su última evaluación completada (post-test o evaluación recurrente anterior),
**entonces** el sistema le presenta una nueva evaluación recurrente obligatoria de **16 preguntas** (2 por cada uno de los 8 temas) antes de continuar usando el chat con normalidad.

---

### Escenario 2 — Preguntas no repetidas entre evaluaciones

**Dado que** el sistema arma una evaluación recurrente para un empleado,
**cuando** selecciona las preguntas del banco,
**entonces** excluye las preguntas que ese empleado ya respondió en evaluaciones anteriores (post-test y recurrentes), seleccionando al azar 2 preguntas nuevas por tema. El registro de preguntas vistas se persiste por usuario.

---

### Escenario 3 — Agotamiento del banco por tema

**Dado que** un empleado ya respondió tantas evaluaciones que algún tema tiene menos de 2 preguntas sin usar,
**cuando** el sistema arma la siguiente evaluación,
**entonces** reinicia el ciclo de preguntas vistas **solo para ese tema** (las preguntas más antiguas vuelven a estar disponibles), garantizando que la evaluación siempre pueda armarse con 16 preguntas.

---

### Escenario 4 — Registro de resultados con desempeño por tema

**Dado que** un empleado completa una evaluación recurrente,
**cuando** el resultado se guarda,
**entonces** se registra en una nueva fila (append-only) con: score, total, fecha, tipo de evaluación (`recurrente`) y **desempeño por tema** (correctas/total por cada `topic_key`), permitiendo identificar áreas críticas específicas en cada intento.

---

### Escenario 5 — Evolución visible en el dashboard personal

**Dado que** un empleado tiene una o más evaluaciones recurrentes completadas,
**cuando** visita `/dashboard`,
**entonces** ve: (a) la línea de tiempo completa de sus notas (diagnóstico → post-test → recurrentes), (b) sus áreas críticas actuales calculadas a partir de la evaluación más reciente, y (c) la fecha estimada de su próxima evaluación.

---

### Escenario 6 — Evolución visible en el dashboard organizacional

**Dado que** un administrador accede a `/org-dashboard`,
**cuando** la vista carga las métricas de su organización (filtradas por RUC),
**entonces** ve: (a) el promedio de la evaluación recurrente más reciente por empleado, (b) la tendencia organizacional de notas en el tiempo, (c) las áreas críticas agregadas de la organización (temas con peor desempeño promedio), y (d) el estado de cumplimiento (empleados al día vs. con evaluación pendiente/vencida).

---

### Escenario 7 — Empleado sin post-test previo

**Dado que** un empleado aún no completa el post-test inicial,
**cuando** inicia sesión,
**entonces** el ciclo de evaluación recurrente **no se activa** — el flujo original (diagnóstico → chatbot → post-test) se mantiene intacto. La recurrencia empieza a contar desde la fecha del post-test completado.

---

### Escenario 8 — Evaluación pendiente no completada

**Dado que** a un empleado se le presentó la evaluación recurrente pero cerró sesión sin completarla,
**cuando** vuelve a iniciar sesión,
**entonces** la evaluación se le vuelve a presentar (con un nuevo set de preguntas no vistas), y su estado figura como "evaluación vencida" en el dashboard organizacional hasta que la complete.

---

### Escenario 9 — Evaluación recurrente para administradores (recordatorio omitible)

**Dado que** un usuario con rol `admin` inicia sesión y le corresponde una evaluación recurrente (5 días o más desde su última evaluación completada),
**cuando** la plataforma carga,
**entonces** se le muestra un **recordatorio no bloqueante** con la opción de rendir la evaluación en ese momento o de **omitirla** y continuar usando la plataforma con normalidad. Si la omite, el recordatorio vuelve a aparecer en su siguiente inicio de sesión hasta que la complete.

---

## Restricciones

- El intervalo de recurrencia es de **5 días calendario** desde la última evaluación completada (no desde el último login).
- Las evaluaciones recurrentes usan el **mismo banco `posttest_questions`** (200 preguntas) y la **misma estructura** que el post-test: 16 preguntas, 2 por tema, mismos 8 `topic_key` del diagnóstico — para que todas las mediciones sean comparables entre sí.
- El control de "preguntas ya vistas" es **por usuario** y se valida en backend (nunca en cliente).
- Los resultados son **append-only**: nunca se sobrescriben intentos anteriores.
- El desempeño por tema se guarda en **cada** intento recurrente (no solo el score global), porque las "áreas críticas" deben ser medibles y comparables en el tiempo.
- El dashboard organizacional solo muestra datos agregados de empleados con `ruc` igual al del administrador autenticado (mismo aislamiento que HU17/HU20).
- La evaluación recurrente aplica a **ambos roles**, con distinta obligatoriedad: para `employee` es **bloqueante** (debe completarla para usar el chat con normalidad); para `admin` es un **recordatorio omitible** que reaparece en cada inicio de sesión hasta ser atendido.

---

## Notas Técnicas

- Nueva tabla `evaluation_attempts`: `id uuid`, `user_id uuid FK`, `test_type text` (`posttest` | `recurrente`), `score int`, `total int`, `topics_performance jsonb` (por topic_key: `{correct, total}`), `taken_at timestamptz`. Reemplaza funcionalmente a `quiz_results` para nuevos intentos (se evalúa migrar los registros existentes o mantener ambas tablas con lectura combinada). SQL en `docs/sql/evaluation_attempts.sql`.
- Nueva tabla `seen_questions`: `user_id uuid`, `question_id uuid FK → posttest_questions`, `seen_at timestamptz`, PK compuesta (`user_id`, `question_id`). Alimentada al completar cada evaluación.
- Nuevo endpoint `GET /api/recurring-test/status` — devuelve si el usuario tiene evaluación recurrente pendiente (días transcurridos, fecha de próxima evaluación).
- `GET /api/posttest` se extiende (o se crea `GET /api/recurring-test`) con la lógica de exclusión de `seen_questions` + reinicio de ciclo por tema.
- `POST /api/quiz` se extiende para aceptar `test_type` y `topics_performance`, e insertar en `evaluation_attempts` + marcar preguntas como vistas.
- `/chat` (client): al cargar, consulta el status; si hay evaluación pendiente, presenta el módulo de evaluación en modo obligatorio.
- `lib/orgMetrics.ts` + `GET /api/org-dashboard`: agregar métricas de recurrencia (promedio último intento, tendencia, áreas críticas agregadas, % cumplimiento).
- `app/dashboard/page.tsx` + `GET /api/dashboard`: línea de tiempo unificada, áreas críticas del último intento, countdown de próxima evaluación.
