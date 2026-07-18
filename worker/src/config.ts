import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WORKER_USER_ID: z.string().uuid(),
  WORKER_COMMAND_TOKEN: z.string().min(24),
  SESSION_DIR: z.string().min(1).default('./sessions'),
  PORT: z.coerce.number().int().positive().default(8080),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  HUGGINGFACE_API_KEY: z.string().min(1).optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),
});

/** Validated runtime configuration for the private worker process. */
export const config = environmentSchema.parse(process.env);

