import { describe, expect, it } from "vitest";
import { isValidPhone, normalizePhone } from "../src/lib/validation";

describe("phone validation", () => {
  it("accepts a 10-digit Vietnamese mobile number", () => {
    expect(isValidPhone("0901234567")).toBe(true);
    expect(isValidPhone("090 123 4567")).toBe(true);
    expect(normalizePhone("090 123 4567")).toBe("0901234567");
  });

  it("rejects empty or too-short values", () => {
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("090123456")).toBe(false);
  });
});
