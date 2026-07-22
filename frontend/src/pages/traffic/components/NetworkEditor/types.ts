export interface CompetitorInfo {
  base_route_id: string;
  base_direction_id: number;
  competitor_route_id: string;
  competitor_direction_id: number;
  shared_stops_count: number;
  overlap_score: number | null;
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
