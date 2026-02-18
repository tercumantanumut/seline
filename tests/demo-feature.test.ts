import { describe, it, expect, vi } from 'vitest';
import {
  formatTimestamp,
  generateDemoId,
  isValidEmail,
  debounce,
} from '../lib/demo-feature';

describe('Demo Feature Utilities', () => {
  describe('formatTimestamp', () => {
    it('should format timestamp correctly', () => {
      const timestamp = new Date('2026-02-18').getTime();
      const result = formatTimestamp(timestamp);
      expect(result).toContain('February');
      expect(result).toContain('2026');
    });
  });

  describe('generateDemoId', () => {
    it('should generate unique IDs with prefix', () => {
      const id1 = generateDemoId('test');
      const id2 = generateDemoId('test');
      expect(id1).toMatch(/^test_\d+_/);
      expect(id2).toMatch(/^test_\d+_/);
      expect(id1).not.toBe(id2);
    });

    it('should use default prefix', () => {
      const id = generateDemoId();
      expect(id).toMatch(/^demo_\d+_/);
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('test.email@domain.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
    });
  });

  describe('debounce', () => {
    it('should debounce function calls', async () => {
      const mockFn = vi.fn();
      const debouncedFn = debounce(mockFn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(mockFn).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
});
