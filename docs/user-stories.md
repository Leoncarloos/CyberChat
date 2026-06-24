# Historias de usuario

# Historia de Usuario — HU11

---

## Información General

| Campo                | Detalle                                      |
|----------------------|----------------------------------------------|
| **Código**           | HU11                                         |
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
