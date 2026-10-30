import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  document.body.removeAttribute('data-scroll-locked');
  document.body.style.pointerEvents = '';
});
