import { describe, expect, it } from 'vitest';
import { ChatService } from './chat.service.js';

describe('ChatService', () => {
  const service = new ChatService();

  it('should create a valid message', () => {
    expect(service.createMessage('Hello!')).toEqual({
      content: 'Hello!',
    });
  });

  it('should trim whitespace', () => {
    expect(service.createMessage('  Hello!  ')).toEqual({
      content: 'Hello!',
    });
  });

  it('should reject empty messages', () => {
    expect(service.createMessage('   ')).toBeNull();
  });

  it('should reject non-string values', () => {
    expect(service.createMessage(42)).toBeNull();
  });

  it('should reject messages longer than 500 characters', () => {
    expect(service.createMessage('a'.repeat(501))).toBeNull();
  });

  it('should accept valid room names', () => {
    expect(service.parseRoom(' gaming ')).toBe('gaming');
  });

  it('should reject unknown room names', () => {
  expect(service.parseRoom('private')).toBeNull();
  expect(service.parseRoom(42)).toBeNull();
  });
});
