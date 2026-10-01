import { z } from 'zod';

// Set this before feature and wire schemas are constructed. Zod's default JIT
// probes new Function, which strict CSP blocks even when the exception is caught.
z.config({ jitless: true });
