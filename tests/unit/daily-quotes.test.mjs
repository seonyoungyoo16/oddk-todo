import test from "node:test";
import assert from "node:assert/strict";
import { DAILY_QUOTES, quoteForDate } from "../../app/todo/daily-quotes.ts";
import { koreanToday } from "../../app/todo/plan-date.ts";

test("the same Seoul date keeps the same quote after reload or across devices", () => {
  assert.deepEqual(quoteForDate("2026-10-31"), quoteForDate(koreanToday(new Date("2026-10-31T10:00:00Z"))));
  assert.equal(quoteForDate("2026-10-31"), quoteForDate("2026-10-31"));
});

test("quotes change at the Seoul day boundary, including month, year and leap day", () => {
  for (const boundary of ["2026-10-31T15:00:00Z", "2026-12-31T15:00:00Z", "2024-02-28T15:00:00Z", "2024-02-29T15:00:00Z"]) {
    const at = new Date(boundary), before = new Date(at.getTime() - 1);
    assert.notEqual(quoteForDate(koreanToday(before)).id, quoteForDate(koreanToday(at)).id);
  }
});

test("a full rotation has 30 unique quotes and avoids consecutive author repeats", () => {
  assert.equal(DAILY_QUOTES.length, 30);
  const rotation = Array.from({ length: 31 }, (_, day) => quoteForDate(new Date(Date.UTC(2026, 9, 31 + day)).toISOString().slice(0, 10)));
  assert.equal(new Set(rotation.slice(0, 30).map(quote => quote.id)).size, 30);
  assert.equal(rotation[0].id, rotation[30].id);
  for (let i = 1; i < rotation.length; i++) assert.notEqual(rotation[i - 1].author, rotation[i].author);
  assert.equal(new Set(DAILY_QUOTES.map(quote => quote.text)).size, 30);
});

test("missing and invalid dates do not substitute a random or incorrect quote", () => {
  for (const date of ["", "2026-02-29", "2026-02-30", "2026-13-01", "2026-10-00", "26-10-31", "0000-01-01", "not-a-date"]) assert.equal(quoteForDate(date), null);
  for (const date of ["0001-01-01", "1969-12-31", "2024-02-29", "9999-12-31"]) assert.ok(quoteForDate(date));
});

test("every quote has Korean text, a precise source and an explicit translation flag", () => {
  assert.equal(new Set(DAILY_QUOTES.map(quote => quote.id)).size, 30);
  assert.ok(new Set(DAILY_QUOTES.map(quote => quote.author)).size >= 9);
  for (const quote of DAILY_QUOTES) {
    assert.match(quote.text, /[가-힣]/);
    assert.ok(quote.author && quote.work && quote.passage);
    assert.equal(new URL(quote.sourceUrl).protocol, "https:");
    assert.equal(typeof quote.translated, "boolean");
  }
});
