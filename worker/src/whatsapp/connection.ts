import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { AIRouter } from '../ai/AIRouter.js';
import { config } from '../config.js';
import { MemoryService } from '../memory/MemoryService.js';
import { AssistantRepository } from '../repositories/AssistantRepository.js';
import { ManualApprovalService } from './manualApprovalService.js';
import { handleIncomingMessage } from './messageHandler.js';

/** Opens and maintains the Baileys socket, persisting QR and credential state across restarts. */
export async function startWhatsApp(input: {
  userId: string;
  repository: AssistantRepository;
  router: AIRouter;
  memoryService: MemoryService;
}): Promise<WASocket> {
  const sessionPath = join(config.SESSION_DIR, input.userId);
  await mkdir(sessionPath, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
  });
  socket.ev.on('creds.update', () => {
    void saveCreds();
  });

  socket.ev.on('connection.update', (update) => {
    void handleConnectionUpdate(update, input, socket);
  });
  socket.ev.on('messages.upsert', ({ messages, type }) => {
    console.log(`[messages.upsert] Received ${messages.length} messages, type: ${type}`);
    for (const message of messages) {
      console.log(`[messages.upsert] Message remoteJid: ${message.key.remoteJid}, fromMe: ${message.key.fromMe}`);
      void handleIncomingMessage({ ...input, socket, message }).catch((error: unknown) => {
        console.error('Inbound message handling failed', error);
      });
    }
  });

  new ManualApprovalService(input.userId, socket, input.repository).start();
  return socket;
}

/** Translates Baileys connection events into dashboard status and safe reconnect behavior. */
async function handleConnectionUpdate(
  update: {
    connection?: 'connecting' | 'open' | 'close';
    lastDisconnect?: { error?: Error };
    qr?: string;
  },
  input: {
    userId: string;
    repository: AssistantRepository;
    router: AIRouter;
    memoryService: MemoryService;
  },
  socket: WASocket,
): Promise<void> {
  if (update.qr) {
    const qrCode = await QRCode.toDataURL(update.qr);
    await input.repository.updateSession(input.userId, { status: 'qr_pending', qr_code: qrCode });
  }
  if (update.connection === 'open') {
    await input.repository.updateSession(input.userId, {
      status: 'connected',
      qr_code: null,
      last_connected_at: new Date().toISOString(),
    });
  }
  if (update.connection === 'close') {
    const statusCode = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;
    await input.repository.updateSession(input.userId, { status: loggedOut ? 'disconnected' : 'error' });
    socket.ev.removeAllListeners('connection.update');
    if (!loggedOut) {
      setTimeout(() => {
        void startWhatsApp(input).catch((error: unknown) => console.error('WhatsApp reconnect failed', error));
      }, 3_000);
    }
  }
}
