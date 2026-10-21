import { describe, expect, it } from "vitest";
import { BLINK_ON, FLASH_PEAK, OFF, matchPads, padStateAt } from "./padState.js";

const at = (pickups, t) => padStateAt(pickups, t).intensity;
const one = [{ t: 10, back: 14 }];

describe("padStateAt", () => {
  it("is fully lit before the first pickup", () => {
    expect(at(one, 0)).toBe(1);
    expect(at(one, 9.99)).toBe(1);
  });

  it("is lit when there is no pickup", () => {
    expect(at([], 5)).toBe(1);
    expect(at(undefined, 5)).toBe(1);
  });

  it("blinks three times during the half second after the pickup", () => {
    expect(at(one, 10)).toBe(BLINK_ON);
    expect(at(one, 10.05)).toBe(BLINK_ON);
    expect(at(one, 10.1)).toBe(OFF);
    expect(at(one, 10.2)).toBe(BLINK_ON);
    expect(at(one, 10.3)).toBe(OFF);
    expect(at(one, 10.36)).toBe(BLINK_ON);
    expect(at(one, 10.45)).toBe(OFF);
    const lit = [];
    for (let t = 10; t < 10.5; t += 0.01) lit.push(at(one, t) === BLINK_ON);
    const rising = lit.filter((on, i) => on && (i === 0 || !lit[i - 1])).length;
    expect(rising).toBe(3);
  });

  it("stays off until the pad is available again", () => {
    expect(at(one, 10.5)).toBe(OFF);
    expect(at(one, 12)).toBe(OFF);
    expect(at(one, 13.99)).toBe(OFF);
  });

  it("flashes when the pad is available again then settles to 1", () => {
    expect(at(one, 14)).toBeCloseTo(OFF);
    expect(at(one, 14 + 0.175)).toBeCloseTo(FLASH_PEAK);
    expect(at(one, 14 + 0.0875)).toBeCloseTo((OFF + FLASH_PEAK) / 2);
    expect(at(one, 14 + 0.2625)).toBeCloseTo((FLASH_PEAK + 1) / 2);
    expect(at(one, 14.4)).toBe(1);
    expect(at(one, 100)).toBe(1);
  });

  it("stays off until the end when the pad never comes back", () => {
    const never = [{ t: 10, back: null }];
    expect(at(never, 11)).toBe(OFF);
    expect(at(never, 1e6)).toBe(OFF);
  });

  it("follows the last pickup when there are several", () => {
    const many = [{ t: 10, back: 14 }, { t: 20, back: 25 }, { t: 30, back: null }];
    expect(at(many, 16)).toBe(1);
    expect(at(many, 20)).toBe(BLINK_ON);
    expect(at(many, 22)).toBe(OFF);
    expect(at(many, 25.175)).toBeCloseTo(FLASH_PEAK);
    expect(at(many, 31)).toBe(OFF);
  });

  it("gives the same result whatever the order of the calls", () => {
    const many = [{ t: 10, back: 14 }, { t: 20, back: 25 }];
    const times = [0, 10.05, 12, 14.1, 21, 25.1, 30, 10.05, 0, 21];
    const forward = times.map((t) => at(many, t));
    const backward = [...times].reverse().map((t) => at(many, t)).reverse();
    expect(backward).toEqual(forward);
    expect(at(many, 12)).toBe(OFF);
  });
});

describe("matchPads", () => {
  const scenery = [{ x: 0, y: 0, id: "a" }, { x: 1000, y: 0, id: "b" }];

  it("matches each track pad to the nearest scenery pad within the tolerance", () => {
    const result = matchPads(scenery, [{ x: 10, y: -20, pickups: [{ t: 1, back: null }] }]);
    expect(result).toHaveLength(1);
    expect(result[0].scenery.id).toBe("a");
    expect(result[0].pickups).toEqual([{ t: 1, back: null }]);
  });

  it("ignores a track pad too far from every scenery pad", () => {
    expect(matchPads(scenery, [{ x: 500, y: 0, pickups: [] }])).toEqual([]);
  });

  it("handles missing track pads", () => {
    expect(matchPads(scenery, undefined)).toEqual([]);
  });
});
