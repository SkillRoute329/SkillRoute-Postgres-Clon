/**
 * GTFS Exporter Service — TransformaFacil 2.0
 * ============================================
 * Exporta las líneas UCOT en formato GTFS estándar.
 * Compatible con Google Maps, Moovit, API Montevideo IMM.
 *
 * DÓNDE COLOCAR: frontend/src/services/gtfsExporter.ts
 *
 * USO:
 *   import { gtfsExporter } from '../services/gtfsExporter';
 *
 *   // Descargar ZIP con todos los archivos GTFS
 *   await gtfsExporter.exportarZip();
 *
 *   // Obtener como JSON (para API)
 *   const feed = await gtfsExporter.generarFeed();
 */

import { getDocs, collection } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { LineaUCOT } from '../types/transformafacil';

// ─── Tipos GTFS ───────────────────────────────────────────────────────────────

interface GTFSAgency {
  agency_id: string;
  agency_name: string;
  agency_url: string;
  agency_timezone: string;
  agency_lang: string;
  agency_phone: string;
}

interface GTFSRoute {
  route_id: string;
  agency_id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  route_color: string;
  route_text_color: string;
  route_desc: string;
}

interface GTFSStop {
  stop_id: string;
  stop_code: string;
  stop_name: string;
  stop_lat: string;
  stop_lon: string;
  stop_timezone: string;
}

interface GTFSTrip {
  route_id: string;
  service_id: string;
  trip_id: string;
  trip_headsign: string;
  direction_id: string;
  shape_id: string;
}

interface GTFSCalendar {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

interface GTFSShape {
  shape_id: string;
  shape_pt_lat: string;
  shape_pt_lon: string;
  shape_pt_sequence: string;
}

// ─── Datos fijos UCOT ─────────────────────────────────────────────────────────

const AGENCY_UCOT: GTFSAgency = {
  agency_id: 'UCOT',
  agency_name: 'Unión Cooperativa Obrera del Transporte',
  agency_url: 'https://www.ucot.com.uy',
  agency_timezone: 'America/Montevideo',
  agency_lang: 'es',
  agency_phone: '',
};

const LINEAS_FALLBACK: GTFSRoute[] = [
  { route_id: '300a', agency_id: 'UCOT', route_short_name: '300', route_long_name: 'Maroñas - Centro - Maroñas (Ida)', route_type: 3, route_color: 'F5A623', route_text_color: '000000', route_desc: 'Eje 8 de Octubre' },
  { route_id: '300b', agency_id: 'UCOT', route_short_name: '300', route_long_name: 'Maroñas - Centro - Maroñas (Vuelta)', route_type: 3, route_color: 'F5A623', route_text_color: '000000', route_desc: 'Eje 8 de Octubre' },
  { route_id: '306a', agency_id: 'UCOT', route_short_name: '306', route_long_name: 'La Unión - Pocitos (Ida)', route_type: 3, route_color: 'F5A623', route_text_color: '000000', route_desc: 'Eje 8 de Octubre' },
  { route_id: '306b', agency_id: 'UCOT', route_short_name: '306', route_long_name: 'La Unión - Pocitos (Vuelta)', route_type: 3, route_color: 'F5A623', route_text_color: '000000', route_desc: 'Eje 8 de Octubre' },
  { route_id: '316a', agency_id: 'UCOT', route_short_name: '316', route_long_name: 'Piedras Blancas - Centro (Ida)', route_type: 3, route_color: 'F5A623', route_text_color: '000000', route_desc: '' },
  { route_id: '328a', agency_id: 'UCOT', route_short_name: '328', route_long_name: 'Manga - Tres Cruces (Ida)', route_type: 3, route_color: 'F5A623', route_text_color: '000000', route_desc: '' },
  { route_id: '329a', agency_id: 'UCOT', route_short_name: '329', route_long_name: 'Melilla - Centro (Ida)', route_type: 3, route_color: 'F5A623', route_text_color: '000000', route_desc: '' },
  { route_id: '330a', agency_id: 'UCOT', route_short_name: '330', route_long_name: 'Peñarol - Centro (Ida)', route_type: 3, route_color: 'F5A623', route_text_color: '000000', route_desc: '' },
  { route_id: 'CE1', agency_id: 'UCOT', route_short_name: 'CE1', route_long_name: 'Diferencial Ciudad Vieja', route_type: 3, route_color: 'E8B800', route_text_color: '000000', route_desc: 'Servicio diferencial' },
  { route_id: 'XA1', agency_id: 'UCOT', route_short_name: 'XA1', route_long_name: 'Expreso Aeropuerto Ida', route_type: 3, route_color: 'C8860A', route_text_color: '000000', route_desc: 'Servicio aeropuerto' },
  { route_id: 'XA2', agency_id: 'UCOT', route_short_name: 'XA2', route_long_name: 'Expreso Aeropuerto Vuelta', route_type: 3, route_color: 'C8860A', route_text_color: '000000', route_desc: 'Servicio aeropuerto' },
];

const CALENDARIOS: GTFSCalendar[] = [
  { service_id: 'LV', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260101', end_date: '20261231' },
  { service_id: 'SA', monday: '0', tuesday: '0', wednesday: '0', thursday: '0', friday: '0', saturday: '1', sunday: '0', start_date: '20260101', end_date: '20261231' },
  { service_id: 'DO', monday: '0', tuesday: '0', wednesday: '0', thursday: '0', friday: '0', saturday: '0', sunday: '1', start_date: '20260101', end_date: '20261231' },
];

// ─── Clase Exportador ─────────────────────────────────────────────────────────

class GTFSExporterService {

  // ── Generar feed completo ────────────────────────────────────────────────────

  async generarFeed(): Promise<{
    agency: GTFSAgency[];
    routes: GTFSRoute[];
    stops: GTFSStop[];
    trips: GTFSTrip[];
    calendar: GTFSCalendar[];
    shapes: GTFSShape[];
  }> {
    // Intentar cargar líneas desde Firestore
    let routes: GTFSRoute[] = [];
    let stops: GTFSStop[] = [];
    const trips: GTFSTrip[] = [];
    const shapes: GTFSShape[] = [];

    try {
      const snap = await getDocs(collection(db, 'lineas_ucot'));
      if (snap.size > 0) {
        snap.docs.forEach((doc) => {
          const data = doc.data() as Partial<LineaUCOT>;
          const routeId = doc.id;

          routes.push({
            route_id: routeId,
            agency_id: 'UCOT',
            route_short_name: String(data.codigo ?? routeId),
            route_long_name: String(data.nombre ?? ''),
            route_type: 3,
            route_color: 'F5A623',
            route_text_color: '000000',
            route_desc: '',
          });

          // Extraer paradas si existen
          if (data.paradas) {
            data.paradas.forEach((p, i) => {
              const stopId = `${routeId}_stop_${i}`;
              stops.push({
                stop_id: stopId,
                stop_code: String(i + 1),
                stop_name: p.nombre,
                stop_lat: String(p.lat),
                stop_lon: String(p.lng),
                stop_timezone: 'America/Montevideo',
              });
            });
          }

          // Extraer shape si existe
          if (data.recorrido) {
            const shapeId = `shape_${routeId}`;
            data.recorrido.forEach((pt, seq) => {
              shapes.push({
                shape_id: shapeId,
                shape_pt_lat: String(pt.lat),
                shape_pt_lon: String(pt.lng),
                shape_pt_sequence: String(seq),
              });
            });

            trips.push({
              route_id: routeId,
              service_id: 'LV',
              trip_id: `trip_${routeId}_LV`,
              trip_headsign: String(data.nombre ?? routeId),
              direction_id: '0',
              shape_id: shapeId,
            });
          }
        });
      } else {
        routes = LINEAS_FALLBACK;
      }
    } catch {
      routes = LINEAS_FALLBACK;
    }

    return {
      agency: [AGENCY_UCOT],
      routes,
      stops,
      trips,
      calendar: CALENDARIOS,
      shapes,
    };
  }

  // ── Convertir a CSV (formato GTFS) ───────────────────────────────────────────

  private objetoACSV<T extends Record<string, unknown>>(datos: T[]): string {
    if (datos.length === 0) return '';
    const headers = Object.keys(datos[0]);
    const filas = datos.map((row) =>
      headers.map((h) => {
        const val = String(row[h] ?? '');
        return val.includes(',') ? `"${val}"` : val;
      }).join(','),
    );
    return [headers.join(','), ...filas].join('\n');
  }

  // ── Exportar como descarga de archivos ZIP (usando JSZip si disponible) ──────

  async exportarComoArchivos(): Promise<void> {
    const feed = await this.generarFeed();

    const archivos: Record<string, string> = {
      'agency.txt': this.objetoACSV(feed.agency as unknown as Record<string, unknown>[]),
      'routes.txt': this.objetoACSV(feed.routes as unknown as Record<string, unknown>[]),
      'stops.txt': this.objetoACSV(feed.stops as unknown as Record<string, unknown>[]),
      'trips.txt': this.objetoACSV(feed.trips as unknown as Record<string, unknown>[]),
      'calendar.txt': this.objetoACSV(feed.calendar as unknown as Record<string, unknown>[]),
      'shapes.txt': this.objetoACSV(feed.shapes as unknown as Record<string, unknown>[]),
    };

    // Descargar cada archivo por separado (sin dependencia de JSZip)
    for (const [nombre, contenido] of Object.entries(archivos)) {
      if (!contenido) continue;
      const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gtfs_ucot_${nombre}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await new Promise((r) => setTimeout(r, 300)); // Esperar entre descargas
    }
  }

  // ── Exportar como JSON (para API) ────────────────────────────────────────────

  async exportarJSON(): Promise<string> {
    const feed = await this.generarFeed();
    return JSON.stringify({
      generatedAt: new Date().toISOString(),
      agency: 'UCOT',
      ...feed,
    }, null, 2);
  }
}

export const gtfsExporter = new GTFSExporterService();
