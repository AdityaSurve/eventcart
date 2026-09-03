import { ordinaryLeastSquares } from './forecast';

describe('ordinaryLeastSquares', () => {
  it('recovers a known line', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = xs.map((x) => 2 + 3 * x);
    const model = ordinaryLeastSquares(xs, ys);

    expect(model.intercept).toBeCloseTo(2, 8);
    expect(model.slope).toBeCloseTo(3, 8);
  });

  it('returns zero slope for a single point', () => {
    expect(ordinaryLeastSquares([0], [10])).toEqual({
      intercept: 10,
      slope: 0,
    });
  });
});
