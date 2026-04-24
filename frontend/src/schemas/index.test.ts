/**
 * Tests — schemas/index.ts (Zod validators)
 * Mes+1 #4 (2026-04-23)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  VehicleEventSchema,
  AlertaRegulacionSchema,
  DelegacionInspectorSchema,
  DesvioReportadoSchema,
  ParametroEconomicoSchema,
  safeParseOrLog,
  safeParseArray,
  parseOrThrow,
} from './index';

describe('Zod schemas — Firestore boundaries', () => {
  describe('VehicleEventSchema', () => {
    it('acepta un vehicle_event válido', () => {
      const doc = {
        idBus: '123',
        agencyId: '70',
        linea: '300',
        lat: -34.89,
        lon: -56.17,
        velocidad: 35,
        timestampGPS: '2026-04-23T18:30:00Z',
      };
      expect(VehicleEventSchema.safeParse(doc).success).toBe(true);
    });
    it('permite campos extra (passthrough)', () => {
      const doc = { idBus: 'A', agencyId: '70', lat: -34, lon: -56, extra: 'foo' };
      expect(VehicleEventSchema.safeParse(doc).success).toBe(true);
    });
    it('rechaza si falta lat', () => {
      const doc = { idBus: 'A', agencyId: '70', lon: -56 };
      expect(VehicleEventSchema.safeParse(doc).success).toBe(false);
    });
    it('rechaza lat no numérico', () => {
      const doc = { idBus: 'A', agencyId: '70', lat: 'no-numero', lon: -56 };
      expect(VehicleEventSchema.safeParse(doc).success).toBe(false);
    });
  });

  describe('DelegacionInspectorSchema', () => {
    it('acepta status válido', () => {
      const doc = {
        serviceNumber: '1000',
        requestedBy: 'uid123',
        status: 'pending',
      };
      expect(DelegacionInspectorSchema.safeParse(doc).success).toBe(true);
    });
    it('rechaza status inválido', () => {
      const doc = {
        serviceNumber: '1000',
        requestedBy: 'uid123',
        status: 'BADSTATUS',
      };
      expect(DelegacionInspectorSchema.safeParse(doc).success).toBe(false);
    });
  });

  describe('DesvioReportadoSchema', () => {
    it('acepta EVENTUAL', () => {
      const doc = {
        tipo: 'EVENTUAL',
        lineaCodigo: '300',
        reportedBy: 'uid123',
      };
      expect(DesvioReportadoSchema.safeParse(doc).success).toBe(true);
    });
    it('acepta PROGRAMADO', () => {
      const doc = {
        tipo: 'PROGRAMADO',
        lineaCodigo: '300',
        reportedBy: 'uid123',
        lat: null,
        lng: null,
      };
      expect(DesvioReportadoSchema.safeParse(doc).success).toBe(true);
    });
    it('rechaza tipo no enum', () => {
      const doc = { tipo: 'OTRO', lineaCodigo: '300', reportedBy: 'uid123' };
      expect(DesvioReportadoSchema.safeParse(doc).success).toBe(false);
    });
  });

  describe('ParametroEconomicoSchema', () => {
    it('acepta un parámetro válido', () => {
      const doc = {
        valor: 45,
        unidad: 'UYU/boleto',
        fuente: 'IMM',
        fechaVigenciaDesde: '2024-01-01',
        confidence: 'oficial',
        editableByAdmin: true,
      };
      expect(ParametroEconomicoSchema.safeParse(doc).success).toBe(true);
    });
    it('rechaza confidence fuera del enum', () => {
      const doc = {
        valor: 45,
        unidad: 'UYU',
        fuente: 'IMM',
        fechaVigenciaDesde: '2024-01-01',
        confidence: 'INVENTADO',
        editableByAdmin: true,
      };
      expect(ParametroEconomicoSchema.safeParse(doc).success).toBe(false);
    });
  });

  describe('safeParseOrLog', () => {
    it('devuelve el parsed si el input es válido', () => {
      const doc = {
        tipo: 'EVENTUAL',
        lineaCodigo: '300',
        reportedBy: 'uid123',
      };
      const res = safeParseOrLog(DesvioReportadoSchema, doc, 'test/validando');
      expect(res).not.toBeNull();
      expect(res?.lineaCodigo).toBe('300');
    });
    it('devuelve null si el input es inválido (no tira)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const res = safeParseOrLog(
        DesvioReportadoSchema,
        { tipo: 'INVALIDO', lineaCodigo: 1 },
        'test/error',
      );
      expect(res).toBeNull();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('safeParseArray', () => {
    it('filtra items inválidos sin tirar', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const items = [
        { idBus: 'A', agencyId: '70', lat: -34, lon: -56 },          // ok
        { idBus: 'B', agencyId: '70', lat: 'mal', lon: -56 },       // inválido
        { idBus: 'C', agencyId: '70', lat: -34.5, lon: -56.1 },     // ok
      ];
      const parsed = safeParseArray(VehicleEventSchema, items, 'test/batch');
      expect(parsed.length).toBe(2);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });

  describe('parseOrThrow', () => {
    it('tira si el input es inválido', () => {
      expect(() =>
        parseOrThrow(DesvioReportadoSchema, { tipo: 'INVALID' }, 'test/requerido'),
      ).toThrow(/test\/requerido/);
    });
    it('devuelve el parsed si el input es válido', () => {
      const doc = { tipo: 'EVENTUAL', lineaCodigo: '300', reportedBy: 'uid' };
      expect(parseOrThrow(DesvioReportadoSchema, doc, 'test/req').lineaCodigo).toBe('300');
    });
  });
});
