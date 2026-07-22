export interface CompetitorInfo {
  base_route_id: string;
  base_direction_id: number;
  competitor_route_id: string;
  competitor_direction_id: number;
  shared_stops_count: number;
  overlap_score: number | null;
  base_daily_trips?: number;
  competitor_daily_trips?: number;
  cannibalization_score?: number;
}

export interface MonthlyTrend {
  month: string;
  boarding: number;
}

export interface TrendData {
  base_line: {
    route_id: string;
    selected_direction: number;
    trend_ida: MonthlyTrend[];
    trend_vuelta: MonthlyTrend[];
    trend_total: MonthlyTrend[];
  };
  competitor_line: {
    route_id: string;
    direction_id: number;
    trend: MonthlyTrend[];
  } | null;
  message: string;
}

export interface LineaCatalogInfo {
  id: string;
  codigo: string;
  nombre: string;
  sentido: string;
  empresa: string;
  destino?: string;
}

export interface ScheduleCrossing {
  base_arrival: string;
  comp_arrival: string;
  gap_minutes: number;
  status: 'VULNERABILITY' | 'ADVANTAGE' | 'NEUTRAL';
  tactical_advice?: {
    current_origin_departure: string;
    recommended_origin_departure: string;
    offset_minutes: number;
  };
}

export interface HotspotOptimizationData {
  ok: boolean;
  hotspot: {
    stop_id: string;
    stop_name: string;
    total_boardings: number;
  } | null;
  baseTravelTimeMinutes: number;
  scheduleCrossings: ScheduleCrossing[];
  message?: string;
}
