# Cumplimiento con la Ley Nº 18.331 de Protección de Datos Personales (Uruguay)

Este documento detalla los principios, políticas y controles técnicos implementados en **SkillRoute** para garantizar el cumplimiento de la **Ley Nº 18.331 de Protección de Datos Personales y Acción de "Habeas Data" de la República Oriental del Uruguay**, así como sus decretos reglamentarios (Decreto Nº 414/009 y modificativos).

---

## 1. Principios de Protección de Datos en SkillRoute

SkillRoute adopta por diseño los principios rectores de la protección de datos:

1. **Principio de Finalidad**: Los datos de los usuarios y conductores (ej. planilla de personal de UCOT) se recaban y procesan con el fin exclusivo de gestionar la asignación de turnos (listería), el monitoreo del cumplimiento de los cartones de servicio y la liquidación de jornales.
2. **Principio de Consentimiento**: El uso de la geolocalización de colectivos y dispositivos móviles se restringe estrictamente a los horarios de servicio asignados para cada conductor.
3. **Principio de Seguridad de Datos**: Implementamos medidas organizativas y técnicas para evitar la alteración, pérdida, tratamiento o acceso no autorizado de la información confidencial.

---

## 2. Tipos de Datos Tratados

El sistema procesa los siguientes conjuntos de datos personales:

* **Datos Identificatorios de Personal**: Nombre completo, Cédula de Identidad (CI), número interno del empleado, teléfono y rol dentro de la cooperativa.
* **Datos Operativos**: Asignación de coches, horarios de check-in/check-out de turnos, y cumplimiento del itinerario.
* **Datos Médicos y de Aptitud**: Fechas de vencimiento de la Libreta de Conducir y de la Ficha Médica de aptitud (almacenados para control preventivo de vigencia y alertas automáticas de caducidad en el panel RRHH).
* **Telemetría GPS**: Geolocalización en tiempo real asociada a los números de coche (asociados de forma indirecta al chofer en turno para medir el OTP de la línea).

---

## 3. Medidas de Seguridad Técnicas y Organizacionales

Para resguardar las bases de datos de SkillRoute (PostgreSQL y Firestore) contra brechas de seguridad:

1. **Hashing de Credenciales**: Las contraseñas de acceso al sistema se cifran en la base de datos local utilizando funciones hash criptográficas robustas con salt individual.
2. **Autenticación por Token Bearer (JWT)**: Todo el intercambio de información entre el frontend y el backend está protegido mediante tokens firmados criptográficamente que expiran automáticamente.
3. **Seguridad a Nivel de Base de Datos**:
   - En PostgreSQL local: Permisos de acceso restringidos por usuario de base de datos a nivel de tabla.
   - En Firestore Cloud (si aplica): Reglas de acceso estrictas basadas en el rol y el identificador único del usuario (`firestore.rules`).
4. **Cifrado de Comunicaciones**: Todo el tráfico se transporta cifrado bajo el protocolo HTTPS/TLS 1.3.

---

## 4. Ejercicio de Derechos ARCO (Habeas Data)

SkillRoute garantiza a los titulares de los datos (empleados y conductores de UCOT) el pleno ejercicio de sus derechos consagrados en la Ley 18.331:

* **Acceso**: El personal puede ver su perfil, histórico de turnos realizados y su desempeño de puntualidad acumulado (pantalla "Mi Cuenta" / "Mi Turno").
* **Rectificación**: Los administradores de RRHH pueden actualizar de forma inmediata cualquier ficha de personal ante errores o cambios (ej. renovación de CI o libreta de conducir).
* **Supresión / Cancelación**: Ante la desvinculación de un empleado, el administrador puede dar de baja su usuario y archivar sus registros históricos limitándolos a fines regulatorios o de liquidación de haberes.
* **Oposición**: El sistema permite desactivar el rastreo de geolocalización cuando el bus se encuentra fuera de servicio (estado "FUERA_DE_SERVICIO" / "TALLER").

---

## 5. Registro y Responsabilidades

En cumplimiento con la normativa uruguaya, el operador de transporte (ej. UCOT) actúa como el **Responsable de la Base de Datos**, y SkillRoute actúa como el **Encargado de Tratamiento**. Corresponde al operador declarar y registrar las bases de datos de personal y de geolocalización ante la **Unidad de Regulación y Control de Datos Personales (URCDP)** de Uruguay.
