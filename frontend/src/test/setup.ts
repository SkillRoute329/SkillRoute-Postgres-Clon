import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('../config/firebase', () => ({
  db: {},
  app: {},
}));
