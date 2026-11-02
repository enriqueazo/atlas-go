import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  countAnswer,
  EMPTY_PLAN,
  isDue,
  markShown,
  postpone,
  startVisit,
  type AdMode,
  type AdPlan,
} from '../src/game/adSchedule.ts';

const DAY = '2026-10-26';

/** One visit to `mode` with `questions` answers, showing each ad as soon as it is due. */
function play(questions: number, plan: AdPlan = EMPTY_PLAN, mode: AdMode = 'countries', day = DAY) {
  const shownAt: number[] = [];
  plan = startVisit(plan, mode, day);
  for (let q = 1; q <= questions; q++) {
    plan = countAnswer(plan, mode, day);
    if (isDue(plan, mode, day)) {
      plan = markShown(plan, mode, day);
      shownAt.push(q);
    }
  }
  return { plan, shownAt };
}

test("the day's first visit: an ad after 3 answers, then further and further apart", () => {
  assert.deepEqual(play(140).shownAt, [3, 9, 19, 34, 54, 79, 109, 139]);
});

test('later visits that day start at 6 answers', () => {
  const { plan } = play(3);
  assert.deepEqual(play(40, plan).shownAt, [6, 16, 31]);
});

test('the 3-answer ad comes back on a later visit if it was never shown', () => {
  const { plan } = play(2);
  assert.deepEqual(play(3, plan).shownAt, [3]);
});

test('each mode has its own 3-answer ad', () => {
  const { plan } = play(3);
  assert.deepEqual(play(3, plan, 'flags').shownAt, [3]);
});

test('a new day brings back the 3-answer ad', () => {
  const { plan } = play(40);
  assert.deepEqual(play(3, plan, 'countries', '2026-10-27').shownAt, [3]);
});

test('a rewarded ad moves the next full-screen ad one gap further', () => {
  let p = startVisit(EMPTY_PLAN, 'countries', DAY);
  p = postpone(p, DAY);
  for (let i = 0; i < 8; i++) p = countAnswer(p, 'countries', DAY);
  assert.equal(isDue(p, 'countries', DAY), false);
  p = countAnswer(p, 'countries', DAY);
  assert.equal(isDue(p, 'countries', DAY), true);
});
