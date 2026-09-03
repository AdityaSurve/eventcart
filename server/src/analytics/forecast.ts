export type LinearTrend = {
  intercept: number;
  slope: number;
};

export function ordinaryLeastSquares(
  xs: number[],
  ys: number[],
): LinearTrend {
  const n = xs.length;

  if (n === 0) {
    return { intercept: 0, slope: 0 };
  }

  if (n === 1) {
    return { intercept: ys[0] ?? 0, slope: 0 };
  }

  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    numerator += dx * (ys[i] - meanY);
    denominator += dx * dx;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  return { intercept, slope };
}

export function predictLinear(model: LinearTrend, x: number) {
  return Math.max(0, model.intercept + model.slope * x);
}

export function exponentialSmoothing(values: number[], alpha = 0.45) {
  if (values.length === 0) {
    return 0;
  }

  let level = values[0];

  for (let i = 1; i < values.length; i += 1) {
    level = alpha * values[i] + (1 - alpha) * level;
  }

  return level;
}

export function demandLabel(options: {
  slope: number;
  recent: number;
  previous: number;
}): 'hot' | 'steady' | 'cooling' {
  const { slope, recent, previous } = options;

  if (recent > previous * 1.25 || slope > 0.2) {
    return 'hot';
  }

  if (slope < -0.08 || (previous > 0 && recent < previous * 0.7)) {
    return 'cooling';
  }

  return 'steady';
}
