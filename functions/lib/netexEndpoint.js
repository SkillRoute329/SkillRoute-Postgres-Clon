"use strict";
/**
 * netexEndpoint.ts — NeTEx Framework Discovery
 * =============================================
 * Trim+ #75 (2026-04-23)
 *
 * NeTEx (Network Timetable Exchange) es el estándar europeo de máximo nivel
 * para datos de transporte público. Exigido en procurement público francés,
 * alemán, holandés, nórdico. Spec: http://netex-cen.eu/
 *
 * Esta implementación v1 es un "framework discovery" — expone metadata que
 * un consumidor europeo usaría para descubrir qué datasets hay disponibles
 * y cómo obtenerlos. NO emite dataset NeTEx completo (eso requiere 5-10
 * días de transformación XML desde GTFS, pendiente).
 *
 * Estrategia pragmática:
 *   - Discovery response referencia a GTFS-static + GTFS-RT actuales.
 *   - Documenta qué partes de NeTEx estarían disponibles cuando se pida.
 *   - Permite a un procurement oficial revisar la compatibilidad sin que
 *     SkillRoute tenga que generar NeTEx completo de entrada.
 *
 * Endpoints:
 *   GET /netexEndpoint/discovery.xml  → XML framework discovery (EU std)
 *   GET /netexEndpoint/discovery.json → JSON equivalente (legibilidad)
 *   GET /netexEndpoint/health
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.netexEndpoint = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors({ origin: true }));
const PUBLISHER = {
    name: 'SkillRoute',
    url: 'https://ucot-gestor-cloud.web.app',
    contact: 'jonathanlaluz@gmail.com',
    countryCode: 'UY',
    region: 'Montevideo',
};
const STATIC_URL = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsStatic/feed.zip';
const RT_VP_URL = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/vehicle-positions.pb';
const RT_TU_URL = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/trip-updates.pb';
const RT_SA_URL = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/gtfsRealtime/service-alerts.pb';
const SIRI_VM_URL = 'https://us-central1-ucot-gestor-cloud.cloudfunctions.net/siriRealtime/vm.json';
function buildDiscoveryJson() {
    const now = new Date().toISOString();
    return {
        NeTExDiscovery: {
            version: '1.0',
            profile: 'NeTEx Framework Discovery v1',
            publisher: PUBLISHER,
            generatedAt: now,
            frames: {
                // Los "frames" en NeTEx agrupan datos por dominio
                resourceFrame: {
                    available: true,
                    description: 'Agencias, redes, líneas, modos de transporte',
                    sourceDataset: STATIC_URL,
                    sourceFormat: 'GTFS-static',
                    mappingStrategy: 'Convertir routes.txt + agency.txt de GTFS a NeTEx:Line + NeTEx:Authority',
                },
                siteFrame: {
                    available: true,
                    description: 'Paradas, terminales, intercambiadores',
                    sourceDataset: STATIC_URL,
                    sourceFormat: 'GTFS-static',
                    mappingStrategy: 'Convertir stops.txt a NeTEx:StopPlace + NeTEx:Quay',
                },
                serviceFrame: {
                    available: 'partial',
                    description: 'Trayectos, puntos de control, recorridos',
                    sourceDataset: STATIC_URL,
                    sourceFormat: 'GTFS-static + shapes.txt',
                    mappingStrategy: 'trips.txt + shapes.txt → NeTEx:ServiceJourneyPattern',
                    note: 'stop_times requiere completion en v2',
                },
                timetableFrame: {
                    available: 'pending',
                    description: 'Horarios programados',
                    reason: 'Requiere stop_times.txt normalizado',
                    eta: 'Q3 2026',
                },
                serviceCalendarFrame: {
                    available: true,
                    description: 'Calendario de servicios (HABIL/SABADO/DOMINGO)',
                    sourceDataset: STATIC_URL,
                    sourceFormat: 'GTFS-static calendar.txt',
                },
            },
            realtime: {
                // NeTEx delega tiempo real a SIRI oficialmente — SkillRoute expone ambos
                siriVehicleMonitoring: {
                    available: true,
                    url: SIRI_VM_URL,
                    profile: 'SIRI-Lite 2.0 JSON',
                },
                gtfsRealtimeVehiclePositions: {
                    available: true,
                    url: RT_VP_URL,
                    profile: 'GTFS-Realtime 2.0 protobuf',
                    note: 'alternativa norteamericana, muchos consumidores EU también la aceptan',
                },
                gtfsRealtimeTripUpdates: {
                    available: true,
                    url: RT_TU_URL,
                    profile: 'GTFS-Realtime 2.0 protobuf',
                },
                gtfsRealtimeServiceAlerts: {
                    available: true,
                    url: RT_SA_URL,
                    profile: 'GTFS-Realtime 2.0 protobuf',
                },
            },
            onDemandFullNeTExXml: {
                available: false,
                reason: 'NeTEx completo XML requiere ~5-10 días de transformación. Disponible bajo acuerdo comercial específico.',
                requestContact: PUBLISHER.contact,
            },
        },
        _comment: 'Este endpoint es un punto de entrada para procurement EU. El dataset completo NeTEx se genera on-demand bajo acuerdo. Para uso típico MaaS, consumir GTFS-static + GTFS-Realtime / SIRI-Lite ya disponibles.',
    };
}
function buildDiscoveryXml() {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<PublicationDelivery xmlns="http://www.netex.org.uk/netex" version="1.10">
  <PublicationTimestamp>${now}</PublicationTimestamp>
  <ParticipantRef>${PUBLISHER.name}</ParticipantRef>
  <PublicationRequest>
    <RequestTimestamp>${now}</RequestTimestamp>
    <Description>NeTEx Framework Discovery response</Description>
  </PublicationRequest>
  <PublicationRefreshInterval>PT24H</PublicationRefreshInterval>
  <Description>SkillRoute Framework Discovery for ${PUBLISHER.region}, ${PUBLISHER.countryCode}</Description>
  <dataObjects>
    <PublicationRef>
      <Name>ResourceFrame</Name>
      <AvailabilityCondition available="true"/>
      <Source>${STATIC_URL}</Source>
      <Format>GTFS-static</Format>
      <MappingStrategy>Convertir routes.txt + agency.txt de GTFS a NeTEx:Line + NeTEx:Authority</MappingStrategy>
    </PublicationRef>
    <PublicationRef>
      <Name>SiteFrame</Name>
      <AvailabilityCondition available="true"/>
      <Source>${STATIC_URL}</Source>
      <Format>GTFS-static</Format>
      <MappingStrategy>stops.txt a NeTEx:StopPlace + NeTEx:Quay</MappingStrategy>
    </PublicationRef>
    <PublicationRef>
      <Name>ServiceFrame</Name>
      <AvailabilityCondition available="partial"/>
      <Source>${STATIC_URL}</Source>
      <Format>GTFS-static + shapes.txt</Format>
      <Note>Full stop_times pending v2</Note>
    </PublicationRef>
    <PublicationRef>
      <Name>TimetableFrame</Name>
      <AvailabilityCondition available="pending"/>
      <Reason>Requires stop_times normalization</Reason>
      <Eta>Q3 2026</Eta>
    </PublicationRef>
    <PublicationRef>
      <Name>SIRI-VM</Name>
      <AvailabilityCondition available="true"/>
      <Source>${SIRI_VM_URL}</Source>
      <Format>SIRI-Lite 2.0 JSON</Format>
    </PublicationRef>
  </dataObjects>
  <Contact>
    <Name>${PUBLISHER.name}</Name>
    <Url>${PUBLISHER.url}</Url>
    <Email>${PUBLISHER.contact}</Email>
  </Contact>
</PublicationDelivery>`;
}
// ─── ENDPOINTS ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        publisher: PUBLISHER.name,
        profile: 'NeTEx Framework Discovery v1',
        endpoints: {
            xml: '/netexEndpoint/discovery.xml',
            json: '/netexEndpoint/discovery.json',
        },
        note: 'Dataset NeTEx completo disponible bajo acuerdo comercial.',
    });
});
app.get('/discovery.json', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(buildDiscoveryJson());
});
app.get('/discovery.xml', (_req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buildDiscoveryXml());
});
exports.netexEndpoint = functions
    .runWith({ timeoutSeconds: 30, memory: '256MB' })
    .https.onRequest(app);
