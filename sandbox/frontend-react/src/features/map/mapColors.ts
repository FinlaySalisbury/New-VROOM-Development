// Route + job colours ported from the legacy ROUTE_COLORS / URGENCY_COLORS.
// The red/orange traffic overrides are FUNCTIONAL data-viz (congestion
// severity), intentionally kept off the brand palette for legibility.

export const ROUTE_COLORS = [
  '#1E2ED9', '#00E38C', '#F47738', '#688ABA', '#A483FF',
  '#9DBBFF', '#FFE564', '#4A4A4A', '#AFFAD7', '#DEECFF',
  '#000000', '#E4EDED', '#6B7280', '#00bcd4', '#795548',
];

export const URGENCY_COLORS: Record<string, string> = {
  critical: '#F47738',
  high: '#FFE564',
  medium: '#9DBBFF',
  low: '#00E38C',
};

export function routeColor(engineerId: number): string {
  const n = ROUTE_COLORS.length;
  return ROUTE_COLORS[(((engineerId % n) + n) % n)];
}

/** Colour + weight for a route leg given its base colour and traffic multiplier. */
export function legStyle(baseColor: string, mult: number): { color: string; weight: number } {
  if (mult > 2.0) return { color: '#ef4444', weight: 4 };   // severe congestion
  if (mult > 1.3) return { color: '#f97316', weight: 3.5 }; // moderate
  return { color: baseColor, weight: 3 };
}
