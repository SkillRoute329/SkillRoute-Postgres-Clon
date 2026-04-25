# TransformaFacil 2.0 — Memoria del Proyecto
> Leer este archivo al inicio de cada sesión para no desperdiciar créditos re-explicando el contexto.

---

## 🤖 Comportamientos automáticos del agente (OBLIGATORIOS)

Estas instrucciones se aplican **automáticamente** al inicio de cualquier sesión donde se toque código. No requieren que el usuario las pida.

### 1. Chequeo de hotspots al empezar

Si la tarea implica **editar varios archivos o refactorizar**, la primera acción debe ser:

```bash
bash scripts/hotspots.sh
```

La salida lista archivos que superan los límites de `docs/CONVENCIONES.md` §5. **Cualquier archivo >400 líneas que se vaya a editar más de una vez en esta sesión DEBE dividirse ANTES** (patrón de ADR 003). Dividir primero baja el consumo de tokens ~6× en las ediciones siguientes.

### 2. Scout rule al tocar un archivo grande

Si se va a **editar un archivo >400 líneas** (aunque sea una sola vez), considerar si se puede dejar más chico en la misma edición extrayendo un subdominio. Regla: dejar el archivo como máximo igual de grande, nunca más grande.

### 3. Lectura parcial, no total

Al abrir un archivo grande (>500 líneas), usar `Read` con `offset` + `limit` para leer solo la sección relevante. Nunca releer el archivo completo si ya está en contexto.

### 4. Python atómico para cambios grandes

Si un cambio afecta >50 líneas de un archivo >500 líneas, usar Python con `os.replace(tmp, path)` en lugar de `Edit` de string largo. Los Edit grandes sobre archivos grandes tienen historial de truncamiento (ver patrón en CLAUDE.md).

### 5. Verificar después de cada cambio estructural

Después de mover código entre archivos:

```bash
cd functions && npx tsc --noEmit 2>&1 | grep -E "^src/.*error TS"
cd ../frontend && npx tsc --noEmit 2>&1 | grep -E "^src/.*error TS"
```

Si hay errores, arreglar ANTES de seguir. No acumular deuda.

### 6. Chequeo de integridad antes de terminar

Antes de decir "listo" al usuario, correr:

```bash
bash scripts/check_integrity.sh
```

Si exit != 0, avisar y no terminar.

### 8. Continuidad entre sesiones (DIRECTRIZ 2026-04-24)

Para que cualquier sesión nueva (Cowork con esta carpeta o Claude Code en
esta carpeta) retome sin tener que re-explicar contexto, hay dos archivos
gestionados automáticamente por Claude:

- **`docs/SESION_ACTUAL.md`** — estado vivo. Lo que está en curso, próximo
  paso concreto, decisiones tomadas pendientes de implementar, bugs
  conocidos no críticos, backlog priorizado. Se reescribe al final de
  cada sesión (no se appendea — siempre refleja el estado AHORA).

- **`docs/HISTORIAL_SESIONES.md`** — append-only. Una entrada por cada
  sesión productiva con qué se entregó, métricas medidas, decisiones,
  truncamientos sufridos. Sirve como auditoría sin tener que leer git
  log. **NO borrar entradas viejas.**

**Protocolo obligatorio para Claude:**

**Al ABRIR sesión** (orden estricto):
1. Leer `CLAUDE.md` (este archivo)
2. Leer `docs/SESION_ACTUAL.md` para saber dónde quedó la sesión previa
3. Si el usuario dice "continuamos" o similar, retomar el "PRÓXIMO PASO
   INMEDIATO" del SESION_ACTUAL.md sin pedir contexto
4. Si el usuario propone algo nuevo que cambie el plan, actualizar
   SESION_ACTUAL.md antes de empezar el trabajo

**Al CERRAR sesión** (antes de que el usuario diga "vamos con el commit"):
1. Reescribir `docs/SESION_ACTUAL.md` con:
   - Última actualización (fecha)
   - "EN CURSO" (qué quedó a mitad y por qué)
   - "PRÓXIMO PASO INMEDIATO" (el paso 1 concreto que la próxima sesión
     debe ejecutar — con líneas de código si aplica)
   - Backlog actualizado
   - Bugs conocidos no críticos
   - Decisiones operativas tomadas durante esta sesión
2. Appendear una entrada nueva a `docs/HISTORIAL_SESIONES.md` con:
   - Tabla de features entregadas
   - Métricas medidas en producción
   - Decisiones que quedaron afuera y por qué
3. Verificar con `bash scripts/check_integrity.sh` antes de proponer
   commit.

**Si la sesión se interrumpe** (truncamiento grave, error inrecuperable,
contexto agotado): dejar `SESION_ACTUAL.md` en estado consistente — qué
se hizo hasta ahora y qué hay que terminar. Nunca dejar el archivo a
medio actualizar.

**Para el usuario (Jonathan)**: estos archivos los gestiona Claude, no
los toques manualmente salvo emergencia. Si necesitás cambiar prioridades
fuera de sesión, escribí en `SESION_ACTUAL.md` un bloque "## NOTA DE
JONATHAN" arriba del todo y Claude lo recoge en la próxima sesión.

---

### 7. Verificación funcional SIEMPRE es responsabilidad del agente (DIRECTRIZ 2026-04-24)

Jonathan no hace pruebas manuales. Después de cualquier cambio desplegado o
deployable, el agente verifica por sí mismo usando las herramientas
disponibles:

- **Cambios frontend**: Claude in Chrome navega al componente afectado,
  extrae el DOM/consola, confirma que renderiza datos reales y que los
  indicadores críticos (tiers, contadores, badges) muestran lo esperado.
- **Cambios backend**: `curl` al endpoint HTTP nuevo o modificado,
  verificación del JSON de respuesta, conteo de docs afectados en Firestore
  si aplica.
- **Cambios de datos/schema**: query de lectura sobre la colección tocada
  para confirmar que los docs tienen la forma esperada.
- **Regresiones**: si el cambio toca un archivo que ya tenía uso en producción
  (ej. ShadowRadar), verificar que la funcionalidad previa sigue andando, no
  sólo la nueva.

No se acepta "probalo vos y avisame". Si una herramienta no está disponible
(Chrome MCP desconectado, sin acceso a Firestore, etc.), decirlo explícito
y buscar alternativa (web_fetch, shell, etc.). Pasarle el testing al
usuario sólo es aceptable cuando:
(a) la verificación requiere credenciales que el agente no puede usar
    (ej. login humano con 2FA);
(b) es una acción irreversible que prefiero que el usuario autorice
    (deploy de producción con efectos financieros, por ejemplo).

En esos casos, ejecutar todo lo verificable automáticamente antes de
pedir la acción humana. Incluir en el reporte qué se verificó y qué queda
pendiente por su intervención específica.

**Refuerzo (DIRECTRIZ 2026-04-24 bis):** Jonathan no testea nunca. Si
Claude no tiene cómo ejecutar un comando o verificación (sandbox sin
acceso a la red de Windows, dev server no corriendo en sandbox, acción
con 2FA, etc.), Claude **redacta la orden completa para Claude Code** y
la deja en `docs/SESION_ACTUAL.md` bajo "PRÓXIMO PASO INMEDIATO". La orden
debe ser pegable tal cual, no un esbozo. Si una tarea queda con
verificación pendiente, el reporte al usuario lo dice explícito y le da
la orden lista. **Nunca** decirle a Jonathan "probalo vos".

**DIRECTRIZ DE IDIOMA — UI siempre en español (2026-04-24):**
Toda la UI del programa va en español. Operadores y reguladores
montevideanos no manejan inglés con fluidez. Las únicas excepciones
permitidas son:
- **Siglas técnicas estándar** que se usan internacionalmente y son
  reconocidas en la industria local: OTP, GPS, STM, IMM, UITP, BRT,
  KPI, GTFS, NeTEx, SIRI, JSON, API, SQL, NoSQL.
- **Nombres propios** de productos o plataformas extranjeras citadas
  como referencia o benchmark: Optibus, Swiftly, Remix, TfL, RATP,
  NYC MTA, NetSuite, etc.
- **Nombres propios de métricas inventadas por agencias específicas**
  (cuando se cita la fuente): "Bunching Index" de NYC MTA, "Service
  Delivery" de TfL/Swiftly, "Régularité" de RATP. Pueden aparecer entre
  comillas como referencia académica, pero el label visible en pantalla
  debe ser la traducción al español: "Índice de Aglomeración",
  "Cumplimiento de Servicio", "Regularidad", etc.

Comentarios internos del código (// y /* */) pueden estar en inglés o
español indistintamente — no son visibles al usuario. Los nombres de
variables/funciones también pueden ser en inglés (es la convención de
JavaScript/TypeScript), pero los strings literales que se renderizan
en la UI van en español.

Si un código existente tiene strings en inglés visibles al usuario,
traducirlas en la primera oportunidad que se toque ese archivo (scout
rule). No es obligatorio refactorizar archivos sólo para traducir, pero
sí es obligatorio NO agregar strings nuevas en inglés.

---

### 9. Workflow Cowork ↔ Claude Code (DIRECTRIZ 2026-04-24)

Jonathan trabaja en dos entornos en paralelo: **Cowork** (sandbox Linux con
acceso a la carpeta) y **Claude Code** (terminal en Windows con git
funcional). El sandbox de Cowork **no puede commitear** porque
`.git/index.lock` queda colgado del lado Windows. Por lo tanto:

**División de roles fija:**

| Entorno | Hace | No hace |
|---|---|---|
| **Cowork (sandbox)** | Edita código, corre tsc/integrity, actualiza docs, hace verificación funcional vía Chrome MCP cuando hay dev server corriendo | `git commit`, `git push`, `git rm` (permisos del mount lo bloquean) |
| **Claude Code (Windows)** | Levanta `npm run dev`, hace verificación funcional con browser/Playwright si Cowork no pudo, ejecuta `git add/commit/push` y `git rm` de archivos legacy | Edits estructurales grandes (eso lo hace mejor Cowork con Python atomic write) |

**Protocolo al cerrar una sesión de Cowork:**

Cowork termina actualizando `docs/SESION_ACTUAL.md` con un bloque
"PRÓXIMO PASO INMEDIATO" que enumera:

1. Qué tiene que verificar visualmente el browser (URLs, KPIs a chequear,
   selectores a probar).
2. Qué chequeos de TS/integrity tiene que correr Claude Code antes del
   commit.
3. El mensaje de commit completo, listo para pegar.

**Prompt estándar para arrancar la sesión en Claude Code:**

```
Continuamos la sesión de Cowork. Leé CLAUDE.md y docs/SESION_ACTUAL.md.
Ejecutá el "PRÓXIMO PASO INMEDIATO". Verificá funcionalmente con
browser. Si todo OK, commiteá con el mensaje que dejó Cowork. Si algo
falla, escribí "## NOTA DE JONATHAN" arriba de SESION_ACTUAL.md
describiendo el problema y avisame.
```

Jonathan pega ese prompt en Claude Code y no tiene que reescribir nada.
Cowork debe asegurarse de dejar SESION_ACTUAL.md en estado consumible
por ese prompt (es decir: PRÓXIMO PASO INMEDIATO concreto, mensaje de
commit redactado, comandos de verificación pegables).

**Cuando Cowork SÍ puede verificar con browser:**

Si en la sesión activa de Cowork el dev server ya está levantado en
`http://localhost:5173` (Jonathan lo arrancó manualmente o quedó vivo
de antes), Cowork debe usar Chrome MCP directamente y dejar la
verificación cerrada antes de pasarle el commit a Claude Code. En ese
caso, el "PRÓXIMO PASO INMEDIATO" para Claude Code se reduce a "tsc
fresco + commit + push", sin verificación visual.

**Cuando Cowork NO puede verificar con browser:**

(El caso típico — el sandbox no puede mantener procesos vivos entre
llamadas bash). Cowork debe:

1. Hacer la máxima verificación estática posible (tsc fresco con
   `--tsBuildInfoFile /tmp/...`, integrity script, Read del archivo
   final para detectar truncamientos).
2. Documentar en SESION_ACTUAL.md exactamente qué tiene que mirar
   Claude Code en el browser, con los pasos numerados.
3. Nunca decir "está listo" si la verificación visual quedó pendiente —
   decirle a Jonathan qué pasos quedan para Claude Code.

---

### 10. Cowork no edita archivos grandes ni archivos críticos compartidos (DIRECTRIZ 2026-04-25)

**Causa documentada:** El 2026-04-25 el sandbox de Cowork corrompió 11 archivos
con bytes NUL (`\x00`) al escribir sobre el mount de Windows. Vite los bundleó
con el contenido roto, los lazy-imports tiraron `SyntaxError` en runtime y
RouteErrorBoundary capturó el error en cada módulo que el usuario abría —
toda la app inutilizable hasta que Claude Code restauró desde
`git checkout HEAD --`. Los archivos en git nunca recibieron la basura;
el daño quedó solo en el filesystem del mount.

Este patrón ya había aparecido antes en otros archivos
(intelligenceApi.ts, index.ts, gtfsRealtime.ts, ShadowRadar.tsx,
scheduleComplianceEngine.ts, etc.). Es un bug no determinístico de las
escrituras concurrentes Cowork-sandbox ↔ Windows-mount sobre archivos grandes.

**Regla operativa vinculante:**

| Tipo de archivo | Cowork puede editar | Claude Code edita |
|---|---|---|
| Archivos NUEVOS (cualquier tamaño) | ✅ Sí | — |
| Archivos < 200 líneas | ✅ Sí | También |
| Archivos 200–500 líneas | ⚠️ Solo Edit puntuales (1–20 líneas), nunca rewrite completo | Preferido para cambios grandes |
| Archivos > 500 líneas | ❌ NO editar — delegar a Claude Code | ✅ Exclusivo |
| Archivos críticos compartidos (ver lista) | ❌ NO editar — delegar | ✅ Exclusivo |

**Lista de archivos críticos compartidos** (los importan ≥10 módulos, romperlos
rompe toda la app):

- `frontend/src/hooks/useEmpresaPropia.ts`
- `frontend/src/services/linesService.ts`
- `frontend/src/services/schedulesService.ts`
- `frontend/src/services/api.ts`
- `frontend/src/services/firestore/index.ts`
- `frontend/src/App.tsx`
- `frontend/src/main.tsx`
- `frontend/src/layouts/DashboardLayout.tsx`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/RouteErrorBoundary.tsx`
- `frontend/src/context/AuthContext.tsx`
- `functions/src/index.ts`
- `functions/src/intelligenceApi.ts`
- `firestore.rules`

**Qué SÍ puede hacer Cowork sobre archivos grandes / críticos:**

1. **Leer** (Read con offset+limit para no consumir contexto innecesario).
2. **Investigar** (grep, find, análisis estático).
3. **Generar reportes** y documentación en `docs/` (archivos nuevos).
4. **Diagnosticar bugs** y dejar el plan de fix listo en
   `docs/SESION_ACTUAL.md` o un dossier específico (ver
   `docs/DIAGNOSTICO_NUL_2026_04_25.md` como ejemplo).
5. **Escribir el commit message completo** para que Code lo pegue.

**Qué NO puede hacer Cowork sobre estos archivos:**

1. Edit con strings largos (>50 líneas).
2. Rewrite completo con Write.
3. Heredocs `>> archivo.ts` desde bash.
4. Operaciones que requieren múltiples Edit consecutivos sobre el mismo archivo.

**Si Cowork detecta que un cambio requerido cae en zona prohibida**, debe:

1. NO intentar el cambio.
2. Documentar exactamente qué hay que cambiar (archivo, líneas, código nuevo,
   código viejo) en `docs/SESION_ACTUAL.md` bajo "PRÓXIMO PASO INMEDIATO".
3. Avisarle a Jonathan que el fix lo aplica Claude Code.

**Verificación profiláctica de NULs — válida SOLO desde Claude Code, NO desde Cowork**

⚠️ **Hallazgo 2026-04-25:** El mount del sandbox de Cowork hacia Windows
**inyecta bytes NUL al leer archivos grandes**. Eso significa que el chequeo
de NULs corrido desde Cowork produce **falsos positivos sistemáticos**:
reporta archivos corruptos que en el filesystem real de Windows están sanos.
Confirmado contrastando contra Claude Code (que ve Windows nativo) — Code
dijo "0 NULs en src" después de un `git checkout HEAD --` y deploy exitoso;
Cowork sobre los mismos archivos reportó >6000 NULs minutos después. Los
archivos en disco real estaban limpios; lo que Cowork lee del mount es
basura.

**Conclusión operativa:**

- El chequeo de NULs **se corre exclusivamente desde Claude Code** (PowerShell
  o terminal nativa de Windows), nunca desde Cowork.
- Si Cowork necesita verificar integridad de archivos grandes, **debe
  delegarlo a Code**, no inferir desde su propia lectura.
- `scripts/check_integrity.sh` también está afectado por este bug si se
  ejecuta desde Cowork. Correrlo solo desde Code.

**Comando válido (Claude Code, Windows nativo):**

```powershell
cd C:\Users\jonat\Desktop\PROYECTOS\GestionUcot\frontend\src
python -c "
import os
total = 0
for root, dirs, files in os.walk('.'):
    if 'node_modules' in root: continue
    for f in files:
        if f.endswith(('.ts', '.tsx')):
            p = os.path.join(root, f)
            n = open(p, 'rb').read().count(b'\x00')
            if n: print(p, n); total += n
print('Total NULs:', total)
"
```

Si Code corre esto y el total > 0, **entonces sí** los archivos están
realmente corruptos en disco. Restaurar con `git checkout HEAD -- <archivo>`
y reaplicar los cambios pendientes.

---

### 11. Regla de No-Regresión (DIRECTRIZ 2026-04-25)

**Todo cambio de aquí en adelante se ejecuta bajo orden estricta de
no-regresión. Ningún feature nuevo, refactor, optimización o fix puede
romper funcionalidad existente.**

**Criterios obligatorios antes de cada commit:**

1. **Tests pasan.** `npm test` (Vitest) + `npm run lint` con exit 0.
2. **TypeScript limpio.** `npx tsc --noEmit --skipLibCheck` con 0 errores
   nuevos. Si había errores pre-existentes, no se agregan más.
3. **Integrity script.** `bash scripts/check_integrity.sh` con exit 0
   (NUL bytes = 0, exports críticos presentes, build limpio).
4. **Build limpio.** `npm run build` sin warnings ni errores.
5. **Verificación funcional de la feature nueva.** Se prueba que la
   feature agregada funciona (Chrome MCP cuando esté disponible, o
   smoke test mínimo).
6. **Verificación de regresión.** Se prueba que **al menos 3 módulos
   pre-existentes** (los más usados: ShadowRadar, CartonManager,
   FleetMonitor, OTPDashboard) siguen renderizando sin errores
   después del cambio. Captura mínima.
7. **Deploy reversible.** Si después de deploy aparece regresión no
   detectada en pasos 5-6, se revierte el commit completo (`git revert`),
   no se parchea encima.

**Filosofía:**

- **Agregar, no reemplazar.** Una feature nueva se monta al lado de
  la existente, no la sustituye. Si algo viejo debe morir, se documenta
  el deprecation y se mantiene N versiones antes de eliminar.
- **Datos viejos siguen siendo válidos.** Schemas Firestore agregan
  campos opcionales, no rompen documentos existentes. Migraciones
  retrocompatibles.
- **APIs viejas siguen respondiendo.** Endpoints existentes mantienen
  contrato. Nuevos endpoints en rutas nuevas (`/v2/`).
- **UI vieja sigue accesible.** Si renombramos un módulo, la URL
  vieja redirige a la nueva, no muere con 404.

**Excepciones permitidas (raras):**

- Refactor con plan documentado y rollback testeado (ej. cuando hay
  bug crítico de seguridad que solo se resuelve rompiendo).
- Aprobación explícita de Jonathan en SESION_ACTUAL.md.

**Si una sesión no puede cumplir estos criterios** (ej. test runner
caído, build sandbox-only, etc.), no commitear hasta que se cumplan.
Documentar en SESION_ACTUAL.md qué pasos faltan para que la próxima
sesión los cierre.

**Aplicación práctica al workflow Cowork ↔ Code:**

- Cowork edita archivos chicos/nuevos + diseña features → entrega a
  Code el changeset listo.
- Code aplica tests/build/integrity en Windows nativo.
- Code commitea solo si los 7 criterios pasan.
- Si fallan, Code escribe "## NOTA DE JONATHAN" en SESION_ACTUAL.md
  describiendo qué falló y qué pasos quedan, y avisa antes de
  continuar.

---

### 12. Verificación en Producción Excluyente (DIRECTRIZ 2026-04-25)

**A partir de esta directriz, la verificación en producción es la
única válida y excluyente. Tests locales, typecheck verde, build
limpio e integrity script OK son condiciones necesarias pero NO
suficientes.**

**Razón:** quien recibe el producto (operador, regulador, directivo,
auditor externo, prospect comercial) **no le importan las pruebas de
código ni locales**. Le importa que cuando abre la URL, todo funcione
exactamente como espera, sin errores, sin friccciones, sin "todavía
no está pulido".

**Criterios obligatorios complementarios a §11 No-Regresión:**

1. **URL pública del feature accede sin errores** desde un browser
   limpio (sin cache, sin auth previa).
2. **Mobile-responsive verificado** en viewport <480px y <768px.
   Cero overflow horizontal, cero texto cortado, cero CTAs invisibles.
3. **Errores de console = 0** en el browser cuando un usuario
   navega el feature. Warnings tolerables si están justificados.
4. **CTAs probados end-to-end.** Si hay un botón "Reservar reunión"
   que abre mailto, se prueba que abre. Si hay un endpoint API que
   un usuario real va a usar, se prueba con datos reales y un token
   real (no solo `/health`).
5. **Output útil para humanos.** Si el feature genera un PDF, JSON,
   reporte — abrirlo y leerlo. Si está vacío, mal formateado, o
   contiene solo placeholders, NO está terminado.
6. **Caso de regresión cross-feature.** Si el feature toca rutas
   o navegación, verificar que rutas pre-existentes siguen
   funcionando. Probar al menos 3 módulos del sidebar después de
   deploy.
7. **Documentación pública del feature.** Si el feature es
   diferenciador comercial, debe tener una URL o documento público
   que un prospect pueda leer sin login.

**No se avanza al siguiente Sprint hasta que el actual cumpla todos
estos criterios.** Si Cowork o Code reportan "Sprint X cerrado" sin
verificación funcional excluyente, el reporte es inválido y se debe
re-abrir el sprint.

**Excepción permitida:** features que requieren auth ADMIN o
SUPERADMIN para evaluación (ej. endpoints regulatorios). En esos
casos, la verificación funcional la hace Jonathan o el equipo
autorizado, y el agente reporta los pasos exactos para que se
ejecute. El sprint sigue abierto hasta que la verificación humana
confirma OK.

**Responsabilidad del agente:**

- Cowork no dice "Sprint cerrado" — dice "Sprint listo para
  verificación final".
- Cowork enumera **qué exactamente** debe verificar Jonathan o
  Code en producción, con URLs y pasos numerados.
- Cuando la verificación 100% se confirma, el agente actualiza
  SESION_ACTUAL.md y mueve la task a `completed`.
- Hasta entonces, la task queda `in_progress`.

---

## 📘 Documentos que debe leer el agente antes de tocar código

Si la tarea implica crear, mover, renombrar o reorganizar archivos, **leer primero**:

1. **`docs/CONVENCIONES.md`** — reglas operativas cortas (dónde va cada tipo de código, sufijos, idioma, límites de tamaño). Consulta rápida <30s.
2. **`ARQUITECTURA_OBJETIVO.md`** — estructura objetivo completa, plan de migración, inventario de limpieza. Leer cuando haya que decidir refactors.

Estas reglas son vinculantes para código nuevo. Convertir código legacy es incremental (scout rule, no refactor masivo).

---

## Reglas de Eficiencia (OBLIGATORIAS — aplicar siempre sin que el usuario las pida)

### Modelo según complejidad
- **Haiku**: CSS, textos UI, renombrar variables, cambios de una línea
- **Sonnet**: lógica de negocio, bugs, integraciones, componentes React
- **Opus**: arquitectura, decisiones críticas de seguridad, razonamiento complejo multi-archivo

### No releer archivos ya leídos
Si un archivo ya fue leído en esta sesión, usar el contenido del contexto. Solo releer si el archivo fue editado después de la última lectura.

### Siempre referenciar archivo:línea
Cada cambio debe indicar el archivo exacto y número de línea. Nunca describir un cambio sin apuntar la ubicación precisa.

### Backend de producción = functions/src/
El backend real es `functions/src/intelligenceApi.ts` (Firebase Cloud Functions), NO `backend/src/`. Siempre modificar el correcto. Después de editar `functions/src/*.ts` se debe compilar con `cd functions && npm run build` antes de deployar.

### Compactar proactivamente
Cuando el contexto supera 10 archivos abiertos o la sesión lleva más de 30 minutos de trabajo intenso, sugerir `/compact` antes de continuar con una nueva tarea.

### Respuestas concisas
- Máximo 2-3 oraciones de contexto antes de actuar
- No explicar lo que se va a hacer, hacerlo directamente
- No resumir al final lo que se acaba de hacer

### OBLIGATORIO antes de cada deploy: `bash scripts/check_integrity.sh`
Este script detecta patrones de truncamiento que vienen ocurriendo al editar archivos grandes. Chequea bytes null, exports críticos en `functions/src/index.ts`, y corre `tsc --noEmit` en frontend y functions. Exit 0 = OK para deploy. No desplegar si marca problema.

### Patrón de truncamiento observado
Archivos grandes editados con `Edit` de strings largos o `>>` heredocs a veces quedan truncados a mitad de expresión. Ya ocurrió en `intelligenceApi.ts`, `index.ts`, `gtfsRealtime.ts`, `scheduleComplianceEngine.ts`, `forecastService.ts`, `competitionService.ts`, `ShadowRadar.tsx`.

**Mitigaciones aplicables en orden de preferencia:**
1. **Python atómico con `os.replace(tmp, path)`** — escritura a temporal + rename atómico. Lo más seguro para cambios grandes.
2. **Edits múltiples pequeños** (1-20 líneas cada uno) en lugar de un Edit gigante. Verificar con `tsc --noEmit` después de cada uno.
3. **Correr `scripts/check_integrity.sh`** al final para capturar cualquier truncamiento residual (bytes null, exports faltantes).
4. Si un archivo queda corrupto, limpiar bytes null con `python3 -c "open('file','wb').write(open('file','rb').read().replace(b'\x00', b''))"` y reaplicar cambios faltantes con Edit o append verificado.

---

## ¿Qué es este proyecto?
Sistema ERP + inteligencia de mercado para el **sistema metropolitano de transporte público de Uruguay** (Montevideo + área metropolitana).
Nombre: **SkillRoute** (antes TransformaFacil 2.0) / **GestionUcot** (nombre heredado del repo, no del producto).
Propósito: Análisis competitivo cross-operador, gestión de flota, KPIs, pronósticos de ingresos, agentes digitales.

## 🏆 Filosofía de producto (DIRECTRIZ 2026-04-24)
**No aceptar "MVP". Apuntar a producto 100% funcional, production-grade, desde el primer commit de cada feature.**

El término "MVP" es útil como fase de desarrollo, no como excusa para entregar
software parcial. SkillRoute no compite contra otros MVPs; compite contra
Optibus, Swiftly, Remix/Via, CAD/AVL tradicionales y el statu quo de operadores
sin herramienta — todos ellos con productos maduros. La única forma de ganar
ese mercado es llegar a la mesa con algo que ya funciona mejor, no con una
promesa.

### Qué significa "production-grade" para cada feature nueva

Antes de cerrar una feature, verificar que tiene:

- **Manejo de errores reales**: auth faltante, data vacía, líneas nuevas sin
  shape, cron que falló, colecciones vacías, STM caído (como hoy con UCOT en
  paro). No asumir el happy path.
- **UX para estado vacío y estado de carga**: el usuario debe entender qué
  está viendo — y qué NO está viendo y por qué. Mensajes concretos, no
  spinners mudos.
- **Métricas visibles**: contadores, badges, tooltips que expliquen la
  decisión detrás de cada número. Un stakeholder no técnico debe poder
  interpretar la pantalla.
- **Consumibilidad para no-técnicos**: directivos, operadores, pitchees
  deben poder usarlo sin que un desarrollador les explique.
- **Documentación operativa**: comentarios inline donde corresponda, README
  o sección en CLAUDE.md cuando la feature tiene cron/endpoints.
- **Verificación por el agente** (directriz 7): probado de punta a punta.
- **Escalabilidad razonable**: código que no colapsa con 10x el volumen.
- **Exportabilidad si es reporting**: Excel, PDF o share link cuando el
  output va a circular fuera del sistema (directivos, reguladores).

### Cuando haya disyuntiva

Entre "entregar un brick rápido" vs "refinarlo a nivel producto", ir por
refinamiento. El tiempo invertido en terminar bien se recupera x10 en la
venta: una demo con grietas destruye credibilidad; una pulida la construye.

### Nivel internacional por defecto (DIRECTRIZ 2026-04-24)

**Cada feature de SkillRoute se construye apuntando al nivel de las mejores
plataformas del mundo del rubro — y si podemos superar lo que ofrecen,
mejor.** No es suficiente con "cumple con lo que pidieron"; la referencia
mental es Optibus, Swiftly, Remix/Via, TfL iBus, RATP, NYC MTA BusTime.

Antes de cerrar cualquier feature nueva, responder estas preguntas:

1. ¿Cómo lo resuelve Optibus/Swiftly/Remix hoy? ¿Qué hacemos igual, qué
   hacemos distinto, qué hacemos mejor?
2. ¿Qué métricas canónicas de la industria (UITP, TCRP, MaaS) soporta
   esta feature? Si la feature produce un número, ese número debe tener
   nombre estándar (DRO, HRR, headway, seat-km, bunching index, etc.),
   no inventarse uno casero.
3. ¿Es exportable a formatos abiertos (GTFS, NeTEx, SIRI, GeoJSON)?
4. ¿La UI respeta patrones accesibles (keyboard nav, contraste, i18n)?
5. ¿Funciona si mañana se suma un 5to operador al sistema, sin tocar código?
6. ¿Tiene la feature un "diferenciador medible" — algo concreto que
   otras plataformas no hacen, o hacen peor? Cuando sí: documentarlo.

Cuando detectemos un hueco en las plataformas grandes (por ejemplo:
ninguna hace análisis cross-operador en tiempo real sobre datos GTFS-RT
combinados — nuestro ShadowRadar DRO sí), marcarlo como ventaja competitiva
en el pitch.

### Anti-patrones a evitar

- "Después lo arreglo" para features que el usuario va a ver.
- "Esto es MVP, así queda" cuando falta algo que un competidor comercial
  sí tiene.
- Dejar estado vacío sin mensaje explicativo.
- Features sin métricas ni indicadores de calidad de los datos.
- Copy-paste de un prototipo directamente a producción sin pulir.

---

## 🎯 Alcance del producto (DIRECTRIZ 2026-04-24)
**SkillRoute NO es un producto para UCOT. Es un producto para TODO el sistema metropolitano de Uruguay.**

- Operadores en scope desde el MVP: **UCOT (70), CUTCSA (50), COME (20), COETC (10)** + cualquier otro operador del sistema metropolitano que se sume.
- Los datos UCOT específicos que ya existen en el repo (cartones, documentos, nóminas, boletines) son **demo / prueba de concepto** — sirvieron para demostrar que con un operador ya funciona. No son el producto final.
- Toda funcionalidad nueva debe ser **cross-operador por diseño**: la empresa propia es una variable, no un hard-code.
- Todo algoritmo nuevo (ej. matriz DRO, HRR, market share por corredor) se calcula para el sistema completo y se presenta filtrable por operador.
- Ninguna mejora puede romper funcionalidad actual. Solo agregar capacidad o corregir. Las features específicas de UCOT que ya existen se preservan como "demo multi-tenant" hasta migrarlas al modelo genérico.
- El pitch a CUTCSA se apoya en esto: el diferenciador es la inteligencia de la red completa, imposible de reproducir por un operador individual.

## Stack Técnico
| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Express.js + TypeScript (puerto 3002) |
| Base de datos | Firebase Firestore (NoSQL) |
| Auth | JWT + Firebase Auth |
| Real-time | Socket.io |
| Deploy | Firebase Hosting + Docker |
| Cloud Functions | Firebase Functions (Node 20) — **backend de producción real** |
| Mobile | Capacitor (Android) + Electron (Desktop) |

## Rutas Clave del Proyecto
```
GestionUcot/
├── backend/src/          ← backend local (dev/pruebas)
├── frontend/src/
│   ├── pages/            ← 31+ vistas
│   ├── components/       ← 50+ componentes
│   └── services/         ← Llamadas al backend
├── functions/src/
│   └── intelligenceApi.ts ← BACKEND DE PRODUCCIÓN (Firebase Cloud Functions)
├── firestore.rules
├── firestore.indexes.json
└── CLAUDE.md
```

## Estado Actual del Sistema (Abril 2026)
- **Completitud general:** ~60-65%
- **Código base:** 85% completo (606 archivos, 124K líneas)
- **Funcionalidad real:** ~50% operativa

## Problemas Críticos Conocidos

### ✅ SEGURIDAD — Firestore RBAC (resuelto en commit 97093ce6, 2026-04-12)
Las reglas ya tienen RBAC por rol (`isAdminNorm`, `isTrafficOrAdmin`, etc.) más
fallback default seguro. Pendiente menor: verificar deploy a Firebase y añadir
reglas explícitas para colecciones con naming inconsistente
(`vehicles` vs `vehiculos`, `lines` vs `lineas`).

### 🟡 DATOS — Ingesta GPS real funcionando, scraper de horarios pendiente
**Lo que funciona (2026-04-17):**
- `backend/src/services/immRealtimeService.ts` — cliente del endpoint público
  `POST https://www.montevideo.gub.uy/buses/rest/stm-online` que devuelve
  GeoJSON con TODOS los buses operando (~300+ buses en cualquier momento).
- `backend/src/services/competitorsIngestionService.ts` — agrega por empresa
  (10=COETC, 20=COME, 50=CUTCSA, 70=UCOT), excluye UCOT y materializa la
  colección Firestore `competidores` con datos reales.
- Smoke test confirmado: 312 buses en <500ms.

**Pendiente:**
- Scraper JSF de horarios/paradas por línea.
- Scheduler/Cloud Function para refresh periódico.

### 🟢 ShadowRadar — datos live cross-operador (fix 2026-04-24)
Corregidos: TDZ en useEffect, truncamiento de archivo, race condition entre
listeners, filtro estricto de dirección (destino coincidente + heading ≤60°),
buses sin `linea` ahora se descartan en las 3 fuentes (IMM, vehicle_events,
viajes_activos). Plan de evolución: matriz DRO offline + snap-to-shape (MVP),
HRR en vivo (v2), dashboard corredores seat-km (v3). Todo cross-operador desde
el MVP — ver DIRECTRIZ 2026-04-24.

### 🟡 FUNCIONALIDAD INCOMPLETA
- Socket.io integrado pero listeners faltantes en frontend
- Mobile app (Capacitor) configurada pero APK no generada

## Skills Instaladas
| Skill | Para qué usarla |
|-------|----------------|
| `ucot-diagnostics` | Diagnóstico completo del sistema |
| `gtfs-integration` | Estándar GTFS, integración Google Maps/Moovit |
| `transport-kpis-uitp` | KPIs internacionales UITP/benchmarking |
| `transport-security` | Hardening Firestore, RBAC, JWT |
| `transit-forecasting` | Pronósticos de demanda (SARIMA, elasticidades) |
| `ucot-real-data` | Ingesta de datos reales desde Excel e IMM API |
| `notebooklm` | Automatización de Google NotebookLM |
| `equipo-agentes` | Routing automático Haiku/Sonnet/Opus |

## Fuentes de Datos Públicas Disponibles

**Funcionando ahora (verificadas 2026-04-17):**
```
GPS en vivo (POST):  https://www.montevideo.gub.uy/buses/rest/stm-online
  body: {"empresa": "70"}  (10=COETC, 20=COME, 50=CUTCSA, 70=UCOT, -1=todas)
  resp: GeoJSON con linea, sublinea, codigoEmpresa, variante, destinoDesc, lat/lng
  → cliente: backend/src/services/immRealtimeService.ts
```

**No usar (devuelven 403/bloqueado):**
```
api.montevideo.gub.uy/api/publictransport/  → 403
catalogodatos.gub.uy                          → WAF bloquea acceso programático
```

## Módulos del Sistema
| Módulo | Archivo principal | Estado |
|--------|-----------------|--------|
| Dashboard CEO | `CEODashboard.tsx` | 🟡 Parcial |
| Análisis Competencia | `CompetitorIntelligencePage.tsx` + `competitionService.ts` | 🟡 GPS real OK; horarios pendientes |
| Gestión Cartones | `CartonManager.tsx` + `cartonService.ts` | 🟡 Funcional (demo UCOT) |
| Pronósticos | `EconomicProjectionsPage.tsx` + `forecastService.ts` | 🟡 Sin datos reales |
| Flota | `FleetMonitorModule.tsx` + `fleetService.ts` | 🟡 Básico |
| ShadowRadar | `ShadowRadar.tsx` | 🟢 Live cross-operador (2026-04-24) |
| Agentes Digitales | `DigitalAgentsModule.tsx` | 🔴 Incompleto |
| Seguridad | `firestore.rules` | 🟢 RBAC OK |

## Glosario del Proyecto
| Término | Significado |
|---------|-------------|
| UCOT | Unión de Cooperativas de Omnibus del Transporte (operador) |
| STM | Sistema de Transporte Metropolitano (regulador Montevideo) |
| IMM | Intendencia Municipal de Montevideo |
| Cartón | Hoja de ruta diaria de un conductor (horarios + paradas) |
| Boletín | Documento oficial con tiempos de tránsito entre paradas |
| Variante | Recorrido alternativo de una misma línea (ej: 300a, 300b) |
| Shadow | Rastreo de posición de vehículos de competencia |
| DRO | Directional Route Overlap — % de ruta A cubierta por ruta B en mismo sentido (TCRP 195) |
| HRR | Headway-to-Rival Ratio — headway propio / tiempo al próximo rival en el tramo compartido |

## Prioridades Actuales (Abril 2026)
1. ~~Conectar datos reales desde IMM~~ — ✅ GPS lista. Falta scraper JSF horarios.
2. ~~Corregir reglas Firestore~~ — ✅ Hechas (commit 97093ce6).
3. ~~Fix ShadowRadar datos estáticos~~ — ✅ Resuelto (2026-04-24).
4. **🟢 MVP matriz DRO cross-operador** — reemplazar heurística destino/heading actual
5. Schedule/Cloud Function refresh periódico `competidores`
6. Scraper JSF horarios reales por línea
7. v2 HRR en vivo + v3 dashboard seat-km market share
8. Completar listeners Socket.io frontend
9. Generar APK Android

## Notas de Contexto
- Jonathan no es programador — es emprendedor con conocimiento profundo del negocio de transporte
- Presentación inminente a **CUTCSA** (empresa 50, mayor operador de Montevideo)
- CUTCSA tiene departamento tecnológico propio, desarrollan hardware y software internamente
- CUTCSA accede a cámaras de seguridad de todos los buses de Montevideo
- El diferenciador real de SkillRoute: datos cruzados de TODOS los operadores (UCOT+COME+COETC+CUTCSA) — imposible de replicar internamente por cualquier operador individual
- Pitch central: no vendemos software, vendemos inteligencia del mercado completo
- Prioridad absoluta: simulador de ingresos + ROI en reducción de inspectores + gestión de desvíos con notificación a conductores
- El objetivo es un sistema de nivel internacional (estándares UITP, GTFS, TCRP)
