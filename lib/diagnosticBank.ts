import "server-only";

/**
 * Banco del diagnóstico inicial CON las respuestas correctas.
 *
 * `import "server-only"` hace que cualquier intento de importar este archivo desde
 * un componente cliente falle en build, en vez de filtrar los `correctIndex` al
 * bundle del navegador — que es exactamente lo que pasaba hasta el 2026-09-12.
 * Para `key`/`label` de los temas usa `lib/diagnosticTopics.ts`.
 */
export type DiagnosticQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type DiagnosticTopicBank = {
  key: string;
  questions: DiagnosticQuestion[];
};

export const diagnosticBank: DiagnosticTopicBank[] = [
  {
    key: "phishing",
    questions: [
      {
        id: "p1",
        question:
          "Recibes un correo del 'Banco de la Nación' que pide hacer clic en un enlace urgente para verificar tu cuenta. ¿Qué haces?",
        options: [
          "Reenviar el correo a compañeros para que estén al tanto",
          "Responder con tus datos para aclarar la situación",
          "Hacer clic para no perder acceso a la cuenta",
          "Ignorar y eliminar el correo, luego contactar al banco por sus canales oficiales",

        ],
        correctIndex: 3,
        explanation:
          "Los bancos nunca solicitan datos por correo. Ante cualquier pedido urgente, verifica siempre por canales oficiales conocidos.",
      },
      {
        id: "p2",
        question:
          "¿Cuál es la señal MÁS clara de un correo de phishing?",
        options: [
          "El remitente usa un dominio falso similar al real (ej. bancol@acion.pe)",
          "Llega un lunes por la mañana",
          "Está bien redactado y sin errores ortográficos",
          "El correo tiene el logo de la empresa",

        ],
        correctIndex: 0,
        explanation:
          "Un dominio con ligeras variaciones es la señal más confiable de phishing. El logo puede copiarse fácilmente y la redacción ya no es indicador, pues la IA mejora los textos falsos.",
      },
    ],
  },
  {
    key: "ia_amenazas",
    questions: [
      {
        id: "ia1",
        question:
          "Recibes una llamada con la voz exacta de tu jefe pidiendo una transferencia bancaria urgente. ¿Qué debes hacer primero?",
        options: [
          "Consultar con un compañero si el jefe está de viaje",
          "Pedir que envíen el pedido por correo electrónico",
          "Colgar y llamar directamente a tu jefe por un número conocido para verificar",
          "Realizar la transferencia para no retrasar el negocio",

        ],
        correctIndex: 2,
        explanation:
          "La IA puede clonar voces con pocos segundos de audio. Ante cualquier solicitud urgente de dinero, verifica siempre por un canal distinto al de la llamada.",
      },
      {
        id: "ia2",
        question:
          "¿Qué es un 'deepfake' en el contexto de ciberseguridad empresarial?",
        options: [
          "Una contraseña muy difícil de descifrar",
          "Video o audio falso generado por IA para suplantar identidades",
          "Un archivo PDF que contiene malware oculto",
          "Un tipo de antivirus que detecta amenazas profundas",

        ],
        correctIndex: 1,
        explanation:
          "Los deepfakes son contenidos audiovisuales falsos creados con IA. Se usan para engañar a empleados haciéndoles creer que un directivo les pide una acción urgente.",
      },
    ],
  },
  {
    key: "canales_venta",
    questions: [
      {
        id: "cv1",
        question:
          "Un cliente te envía por WhatsApp un enlace de pago propio para que proceses su compra. ¿Qué haces?",
        options: [
          "Usar el enlace porque el cliente parece conocido",
          "Rechazar el enlace y procesar el pago solo por los sistemas oficiales de tu empresa",
          "Probar el enlace desde otro dispositivo por seguridad",
          "Pedirle que además envíe el enlace por correo antes de usarlo",

        ],
        correctIndex: 1,
        explanation:
          "Los pagos deben procesarse siempre por sistemas oficiales. Un enlace externo puede robar credenciales o redirigir fondos a cuentas fraudulentas.",
      },
      {
        id: "cv2",
        question:
          "Para proteger la tienda online de tu MYPE, ¿qué acción es MÁS prioritaria?",
        options: [
          "Publicar menos productos para reducir la superficie de ataque",
          "Usar imágenes de baja resolución para cargar más rápido",
          "Cambiar el diseño de la tienda cada mes para confundir atacantes",
          "Mantener actualizado el CMS (WordPress, WooCommerce, etc.) y sus plugins",

        ],
        correctIndex: 3,
        explanation:
          "La mayoría de hackeos a tiendas online explotan vulnerabilidades en software desactualizado. Actualizar el CMS y plugins es la defensa más efectiva y económica.",
      },
    ],
  },
  {
    key: "contrasenas",
    questions: [
      {
        id: "c1",
        question: "¿Cuál de estas contraseñas es la más segura?",
        options: [
          "Tr0p1c@l#Lima$2025",
          "miempresa123",
          "12345678",
          "Empresa2024!",

        ],
        correctIndex: 0,
        explanation:
          "Una contraseña segura combina mayúsculas, minúsculas, números y símbolos, tiene más de 12 caracteres y no contiene palabras predecibles.",
      },
      {
        id: "c2",
        question:
          "Manejas 15 cuentas distintas en sistemas de trabajo. ¿Cuál es la mejor práctica?",
        options: [
          "Anotar todas las contraseñas en un cuaderno bajo el escritorio",
          "Usar variaciones simples como 'empresa1', 'empresa2', 'empresa3'",
          "Usar la misma contraseña en todas para no olvidarla",
          "Usar un gestor de contraseñas para generar y guardar contraseñas únicas",

        ],
        correctIndex: 3,
        explanation:
          "Un gestor de contraseñas (Bitwarden, 1Password) genera y recuerda contraseñas únicas y fuertes. Si una cuenta es comprometida, las demás permanecen seguras.",
      },
    ],
  },
  {
    key: "accesos",
    questions: [
      {
        id: "a1",
        question:
          "Un empleado deja la empresa. ¿Qué debe hacerse INMEDIATAMENTE con sus accesos?",
        options: [
          "Revocar todos sus accesos a sistemas, correo y aplicaciones el mismo día",
          "Cambiar solo la contraseña del correo corporativo",
          "Dejar los accesos activos por si se necesita consultar sus archivos",
          "Esperar 30 días para ver si vuelve antes de desactivarlos",

        ],
        correctIndex: 0,
        explanation:
          "Los accesos de ex-empleados son una de las principales brechas de seguridad. Deben revocarse el mismo día del cese, sin excepciones.",
      },
      {
        id: "a2",
        question:
          "¿Qué significa el principio de 'mínimo privilegio' en el acceso a sistemas?",
        options: [
          "Que cada empleado solo tiene acceso a los sistemas y datos que necesita para su trabajo",
          "Que los empleados nuevos tienen acceso limitado el primer mes",
          "Que los administradores tienen menos privilegios que los usuarios normales",
          "Que el sistema tiene pocas funciones para reducir riesgos",

        ],
        correctIndex: 0,
        explanation:
          "El mínimo privilegio reduce el daño potencial si una cuenta es comprometida. Cada empleado accede solo a lo estrictamente necesario para su función.",
      },
    ],
  },
  {
    key: "ley_29733",
    questions: [
      {
        id: "l1",
        question:
          "Según la Ley N.° 29733, ¿qué obligación tiene tu empresa al recolectar datos de clientes?",
        options: [
          "Publicar la lista de clientes en el portal de transparencia",
          "Informar al cliente qué datos se recogen, para qué se usan y obtener su consentimiento",
          "Registrarlos en el INDECOPI y pagar una tarifa anual",
          "Guardar los datos obligatoriamente en servidores ubicados en Perú",

        ],
        correctIndex: 1,
        explanation:
          "La Ley 29733 exige informar al titular sobre el tratamiento de sus datos personales y obtener consentimiento previo e informado antes de recopilarlos.",
      },
      {
        id: "l2",
        question:
          "Un cliente solicita que elimines todos sus datos personales de tu sistema. ¿Cuál es la respuesta correcta?",
        options: [
          "Ignorar la solicitud si el cliente ya no compra",
          "Atender la solicitud de cancelación dentro del plazo legal, salvo excepciones justificadas",
          "Decirle que no es posible porque ya están en la base de datos",
          "Pedirle que presente una carta notarial antes de proceder",

        ],
        correctIndex: 1,
        explanation:
          "La Ley 29733 reconoce el derecho ARCO (Acceso, Rectificación, Cancelación, Oposición). La empresa debe atender la cancelación salvo excepciones específicas establecidas en la norma.",
      },
    ],
  },
  {
    key: "datos_sensibles",
    questions: [
      {
        id: "ds1",
        question:
          "Un cliente te envía su número de tarjeta por WhatsApp para realizar una compra. ¿Qué haces?",
        options: [
          "Guardarlo en los contactos del celular para agilizar futuros pagos",
          "Anotarlo en un Excel compartido con el equipo de ventas",
          "Enviarlo al área de cobranzas por correo interno",
          "Procesarlo por el sistema oficial y nunca almacenarlo fuera de plataformas certificadas",

        ],
        correctIndex: 3,
        explanation:
          "Los datos de tarjetas deben procesarse solo en plataformas certificadas PCI-DSS. Guardarlos en chats, Excel o correos viola las normas y expone a la empresa a multas y fraudes.",
      },
      {
        id: "ds2",
        question:
          "¿Cuál es la manera correcta de desechar documentos físicos que contienen datos de clientes?",
        options: [
          "Guardarlos en cajas en el almacén durante 1 año",
          "Archivarlos indefinidamente por si se necesitan en el futuro",
          "Destruirlos con trituradora o mediante un servicio certificado de destrucción documental",
          "Tirarlos a la basura normalmente",

        ],
        correctIndex: 2,
        explanation:
          "Los documentos con datos personales deben destruirse de forma segura. Tirarlos sin destruir permite que terceros accedan a información confidencial de tus clientes.",
      },
    ],
  },
  {
    key: "resiliencia",
    questions: [
      {
        id: "r1",
        question:
          "La computadora principal de tu empresa falla un lunes por la mañana. ¿Qué práctica garantiza continuidad del trabajo?",
        options: [
          "Confiar en que el técnico lo repara el mismo día",
          "Tener todos los archivos solo en el escritorio del equipo",
          "Mantener respaldos recientes en la nube y en disco externo siguiendo la regla 3-2-1",
          "Guardar los archivos importantes en memorias USB sin cifrar",

        ],
        correctIndex: 2,
        explanation:
          "La regla 3-2-1: 3 copias de los datos, en 2 medios distintos, con 1 copia fuera de la oficina. Garantiza recuperación ante fallos de hardware, robo o ransomware.",
      },
      {
        id: "r2",
        question:
          "Tu empresa sufre un ataque de ransomware y todos los archivos están cifrados. ¿Cuál es la primera acción correcta?",
        options: [
          "Pagar el rescate lo antes posible para recuperar los archivos",
          "Esperar 24 horas a ver si el sistema se recupera solo",
          "Aislar los equipos de la red y restaurar desde el último respaldo limpio",
          "Intentar descifrar los archivos con software gratuito de internet",

        ],
        correctIndex: 2,
        explanation:
          "Pagar no garantiza recuperar los datos y financia a los atacantes. La respuesta correcta es aislar los equipos, reportar el incidente y restaurar desde un respaldo limpio.",
      },
    ],
  },
];

