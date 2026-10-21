import { describe, expect, it } from "vitest";
import { groupByTeam, sortPlayers } from "./playerOrder.js";

const p = (name, team) => ({ name, team });
const names = (list) => list.map((x) => x.name);

describe("sortPlayers", () => {
  it("sorts by team then by name", () => {
    const sorted = sortPlayers([p("Zed", 1), p("Bob", 0), p("Amy", 1), p("Cat", 0)]);
    expect(names(sorted)).toEqual(["Bob", "Cat", "Amy", "Zed"]);
  });

  it("ignores case", () => {
    expect(names(sortPlayers([p("bob", 0), p("Alice", 0), p("charlie", 0)]))).toEqual(["Alice", "bob", "charlie"]);
  });

  it("ignores accents", () => {
    expect(names(sortPlayers([p("Zoé", 0), p("Émile", 0), p("Eric", 0), p("Adam", 0)]))).toEqual(["Adam", "Émile", "Eric", "Zoé"]);
  });

  it("puts players without team last", () => {
    expect(names(sortPlayers([p("Ann", undefined), p("Bob", 1), p("Cy", null), p("Dan", 0)]))).toEqual(["Dan", "Bob", "Ann", "Cy"]);
  });

  it("does not mutate the input", () => {
    const input = [p("B", 1), p("A", 0)];
    const copy = [...input];
    const sorted = sortPlayers(input);
    expect(input).toEqual(copy);
    expect(sorted).not.toBe(input);
  });

  it("uses getStats", () => {
    const items = [{ stats: p("B", 1) }, { stats: p("A", 0) }];
    expect(sortPlayers(items, (i) => i.stats).map((i) => i.stats.name)).toEqual(["A", "B"]);
  });
});

describe("groupByTeam", () => {
  it("groups blue, orange, then no team, each sorted", () => {
    const groups = groupByTeam([p("Zed", 1), p("Nina", undefined), p("bob", 0), p("Amy", 0), p("Cat", 1)]);
    expect(groups.map((g) => g.team)).toEqual([0, 1, null]);
    expect(groups.map((g) => names(g.players))).toEqual([["Amy", "bob"], ["Cat", "Zed"], ["Nina"]]);
  });

  it("omits absent teams", () => {
    const groups = groupByTeam([p("A", 1), p("B", 1)]);
    expect(groups).toEqual([{ team: 1, players: [p("A", 1), p("B", 1)] }]);
  });

  it("returns an empty list for no players", () => {
    expect(groupByTeam([])).toEqual([]);
  });

  it("puts unknown or missing teams in the no-team group", () => {
    const groups = groupByTeam([p("A", 5), p("B", null), p("C", 0)]);
    expect(groups.map((g) => g.team)).toEqual([0, null]);
    expect(names(groups[1].players)).toEqual(["A", "B"]);
  });

  it("uses getStats", () => {
    const items = [{ stats: p("B", 1) }, { stats: p("A", 0) }];
    const groups = groupByTeam(items, (i) => i.stats);
    expect(groups.map((g) => g.team)).toEqual([0, 1]);
    expect(groups[0].players[0].stats.name).toBe("A");
  });

  it("does not mutate the input", () => {
    const input = [p("B", 1), p("A", 0), p("C", 7)];
    const snapshot = structuredClone(input);
    const copy = [...input];
    groupByTeam(input);
    expect(input).toEqual(snapshot);
    expect(input).toEqual(copy);
  });

  it("returns the original items, not normalized copies", () => {
    const odd = p("A", 5);
    const groups = groupByTeam([odd]);
    expect(groups[0].team).toBeNull();
    expect(groups[0].players[0]).toBe(odd);
    expect(odd.team).toBe(5);
  });

  it("keeps players with identical names", () => {
    const a = { name: "Sam", team: 0, id: 1 };
    const b = { name: "Sam", team: 0, id: 2 };
    const groups = groupByTeam([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].players).toHaveLength(2);
    expect(groups[0].players).toContain(a);
    expect(groups[0].players).toContain(b);
  });

  it("treats names differing only by case or accents as equal and keeps input order", () => {
    const groups = groupByTeam([p("emile", 0), p("Émile", 0), p("EMILE", 0)]);
    expect(names(groups[0].players)).toEqual(["emile", "Émile", "EMILE"]);
  });

  it("sorts empty names first within their team", () => {
    const groups = groupByTeam([p("Bob", 1), p("", 1), p("Amy", 1)]);
    expect(names(groups[0].players)).toEqual(["", "Amy", "Bob"]);
  });

  it("sorts accents within a group", () => {
    const groups = groupByTeam([p("Zoé", 1), p("Émile", 1), p("Eric", 1)]);
    expect(names(groups[0].players)).toEqual(["Émile", "Eric", "Zoé"]);
  });

  it("handles a single player", () => {
    expect(groupByTeam([p("Solo", 0)])).toEqual([{ team: 0, players: [p("Solo", 0)] }]);
  });

  it("returns only the no-team group when no player has a valid team", () => {
    const groups = groupByTeam([p("B", undefined), p("A", -1), p("C", "0")]);
    expect(groups.map((g) => g.team)).toEqual([null]);
    expect(names(groups[0].players)).toEqual(["A", "B", "C"]);
  });

  it("uses getStats for both team and name when normalizing", () => {
    const items = [{ s: p("Z", 9) }, { s: p("A", null) }, { s: p("M", 1) }];
    const groups = groupByTeam(items, (i) => i.s);
    expect(groups.map((g) => g.team)).toEqual([1, null]);
    expect(groups[1].players.map((i) => i.s.name)).toEqual(["A", "Z"]);
  });

  it("throws when getStats returns nothing", () => {
    expect(() => groupByTeam([{}], () => undefined)).toThrow(TypeError);
  });
});
