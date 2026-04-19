# Auditoría: no regresión y prohibición de simulación

**Fecha:** 2025-02-23  
**Comandos ejecutados:** búsqueda de archivos con mock/simul/demo/placeholder y cartones/matriz de servicio.

---

## 1. Archivos con referencias a mock / simul / demo / placeholder

Resultado del comando (PowerShell `Select-String` en `frontend\src`):

| Archivo                                                      | Notas                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `backend\src\index.ts`                                       | Revisar si usa demo/mock                                                                         |
| `frontend\src\components\admin\ConnectivityDebugWidget.tsx`  | Revisar                                                                                          |
| `frontend\src\components\admin\SystemHealthPanel.tsx`        | Revisar                                                                                          |
| **`frontend\src\components\operations\mockData.ts`**         | **Mock de servicios y cartón 2290. No importado en ningún otro archivo. DEPRECADO.**             |
| `frontend\src\components\operations\QuickDispatchPanel.tsx`  | Revisar (puede ser solo texto "demo")                                                            |
| **`frontend\src\components\operations\rotationMockData.ts`** | **Mock de rotación. No importado. DEPRECADO.**                                                   |
| `frontend\src\context\SimulationContext.tsx`                 | Proveedor de modo simulación. Ya no envuelve la app en `main.tsx`.                               |
| `frontend\src\services\simulationAdapter.ts`                 | Adapter en memoria. No importado en ningún archivo. DEPRECADO.                                   |
| Resto (DataIngestion, BootScreen, etc.)                      | Coincidencias por palabras "demo", "placeholder", "simulated" en textos/UI; revisar caso a caso. |

---

## 2. Archivos de cartones y matriz de servicio (flujo real)

| Archivo                                             | Origen de datos / rol                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend\src\services\firestore\cartons.ts`        | **Real.** CartonService: 1) JSON Maestro (`getMasterServicios`, `getMasterLineas`), 2) Firestore `cartones`, `service_definitions`, `lineas/{id}/servicios`. |
| `frontend\src\services\firestore\serviceMatrix.ts`  | **Real.** ServiceMatrixService: historial y subida/borrado en Firestore `service_matrices` + Firebase Storage.                                               |
| `frontend\src\data\ucotMaster.ts`                   | **Real.** Fuente de verdad: `ucot_master_intelligence_2026.json`. Comentario: "Prohibido simular".                                                           |
| `frontend\src\pages\traffic\ServiceMatrix.tsx`      | Carga desde Firestore (subscribeToHistory) y sube Excel real.                                                                                                |
| `frontend\src\pages\traffic\CartonManager.tsx`      | Usa CartonService (Firestore + maestro).                                                                                                                     |
| `frontend\src\pages\traffic\RotationMatrix.tsx`     | CartonService.getAll + FleetService.getVehicles (API/Firestore).                                                                                             |
| `frontend\src\pages\admin\rrhh\RotationManager.tsx` | getMasterServicios(), Firestore (RotationRules, PersonalRotation, Fleet, User), staffAssignmentEngine.                                                       |

**Conclusión:** Los cartones y la matriz de servicio en producción vienen de **ucotMaster (JSON)** y **Firestore** (cartones, service_definitions, service_matrices). No hay flujo activo que use `mockData.ts` ni `rotationMockData.ts`.

---

## 3. Simulación: estado actual

| Elemento                              | Estado                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `SimulationProvider` en `main.tsx`    | **Eliminado.** La app ya no envuelve con SimulationProvider.                                      |
| `SimulationContext` / `useSimulation` | Definidos pero no usados por ningún componente; no hay rama de código que active modo simulación. |
| `simulationAdapter.ts`                | No importado en ningún archivo. Marcado como @deprecated.                                         |
| `mockData.ts` / `rotationMockData.ts` | No importados. Marcados como @deprecated. Solo referencia o tests.                                |

---

## 4. Acciones realizadas

1. **main.tsx:** Sin SimulationProvider; la app arranca sin modo simulación.
2. **simulationAdapter.ts:** Comentario @deprecated (prohibición de simulación).
3. **mockData.ts** y **rotationMockData.ts:** Comentarios @deprecated; indican uso solo para tests/fixtures y que en producción se usen CartonService, ingesta Excel y ucotMaster.

---

## 5. Recomendaciones para 100% real y sin regresión

1. **Cartones visibles como “reales”:** Asegurar que todas las pantallas que muestran cartones (CartonManager, InspectorCapture, DigitalCartonViewer, etc.) obtengan datos solo de `CartonService.getAll()` / `getMasterServicios()` / Firestore, y que el JSON maestro o la ingesta Excel reflejen la estructura real (línea × servicio × puntos de control/horarios).
2. **Ingesta:** Mantener DataIngestion como fuente de datos real (Excel/CSV → Firestore o maestro). No usar mocks en ese flujo.
3. **Tests:** Si se necesitan datos de prueba, importarlos desde `__tests__/fixtures` y no desde `components/operations/mockData.ts`.
4. **Regresión:** En cada cambio, comprobar que los flujos de Matriz de Servicio, Gestor de Cartones, Lista Diaria y Motor de Rotación siguen usando solo Firestore/API/ucotMaster y que ningún import vuelva a usar mockData o simulationAdapter.

---

## 6. Comandos útiles para repetir la auditoría

```powershell
cd "c:\Users\jonat\Desktop\PROYECTOS\TransformaFacil-2.0"
Get-ChildItem -Path frontend\src -Recurse -Include *.ts,*.tsx | Select-String -Pattern "mock|simul|demo|placeholder|fake|dummy" -List | Select-Object -ExpandProperty Path -Unique
Get-ChildItem -Path frontend\src -Recurse -Include *.ts,*.tsx | Select-String -Pattern "carton|Carton|serviceMatrix|matriz" -List | Select-Object -ExpandProperty Path -Unique
```
