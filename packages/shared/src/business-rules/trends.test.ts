import { describe, expect, it } from "vitest";
import { averageDurationDays, bucketByWeek, bucketSumByMonth } from "./trends";

// A fixed Wednesday so "the week containing now" is unambiguous across tests.
const NOW = new Date("2024-06-12T12:00:00Z");

describe("bucketByWeek", () => {
  it("returns `weeks` buckets, oldest first, ending with the week containing now", () => {
    const buckets = bucketByWeek([], 4, NOW);
    expect(buckets).toHaveLength(4);
    expect(buckets.map((b) => b.weekStart)).toEqual(["2024-05-20", "2024-05-27", "2024-06-03", "2024-06-10"]);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it("counts a timestamp into the Mon-Sun week it falls in", () => {
    const buckets = bucketByWeek([new Date("2024-06-11T23:59:00Z"), new Date("2024-06-10T00:00:00Z")], 2, NOW);
    expect(buckets[1]?.weekStart).toBe("2024-06-10");
    expect(buckets[1]?.count).toBe(2);
    expect(buckets[0]?.count).toBe(0);
  });

  it("ignores timestamps that fall outside the requested window", () => {
    const buckets = bucketByWeek([new Date("2024-01-01T00:00:00Z")], 2, NOW);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(0);
  });

  it("a Sunday timestamp counts into the same week as the Monday before it", () => {
    // 2024-06-09 is a Sunday, the last day of the week starting 2024-06-03.
    const buckets = bucketByWeek([new Date("2024-06-09T23:00:00Z")], 2, NOW);
    expect(buckets[0]?.weekStart).toBe("2024-06-03");
    expect(buckets[0]?.count).toBe(1);
  });
});

describe("bucketSumByMonth", () => {
  it("returns `months` buckets, oldest first, ending with the month containing now", () => {
    const buckets = bucketSumByMonth([], 3, NOW);
    expect(buckets.map((b) => b.month)).toEqual(["2024-04", "2024-05", "2024-06"]);
    expect(buckets.every((b) => b.total === 0)).toBe(true);
  });

  it("sums amounts landing in the same month", () => {
    const buckets = bucketSumByMonth(
      [
        { date: new Date("2024-06-01T00:00:00Z"), amount: 100 },
        { date: new Date("2024-06-30T00:00:00Z"), amount: 50 },
        { date: new Date("2024-05-15T00:00:00Z"), amount: 25 },
      ],
      2,
      NOW,
    );
    expect(buckets[0]?.month).toBe("2024-05");
    expect(buckets[0]?.total).toBe(25);
    expect(buckets[1]?.month).toBe("2024-06");
    expect(buckets[1]?.total).toBe(150);
  });

  it("ignores entries outside the requested window", () => {
    const buckets = bucketSumByMonth([{ date: new Date("2023-01-01T00:00:00Z"), amount: 999 }], 2, NOW);
    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBe(0);
  });
});

describe("averageDurationDays", () => {
  it("returns null for an empty set", () => {
    expect(averageDurationDays([])).toBeNull();
  });

  it("averages millisecond durations into days", () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    expect(averageDurationDays([oneDayMs, oneDayMs * 3])).toBe(2);
  });

  it("handles a single duration", () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    expect(averageDurationDays([oneDayMs * 5])).toBe(5);
  });
});
