import { describe, expect, it } from 'vitest';
import {
  answersPass,
  isStaffPin,
  normalizePinAnswer,
  PIN_QUESTION_PASS_COUNT,
} from './staffPinRules.js';

describe('staff PIN rules', () => {
  it('treats 4 of 5 answers as a pass', () => {
    expect(PIN_QUESTION_PASS_COUNT).toBe(4);
    expect(answersPass(4)).toBe(true);
    expect(answersPass(3)).toBe(false);
  });

  it('normalises names and date of birth', () => {
    expect(normalizePinAnswer('mother_name', '  Sita   Devi ')).toBe('sita devi');
    expect(normalizePinAnswer('date_of_birth', '15/09/1991')).toBe('1991-09-15');
    expect(normalizePinAnswer('date_of_birth', '1991-09-15')).toBe('1991-09-15');
  });

  it('accepts a 4 to 8 digit PIN', () => {
    expect(isStaffPin('1234')).toBe(true);
    expect(isStaffPin('12')).toBe(false);
    expect(isStaffPin('abcd')).toBe(false);
  });
});
