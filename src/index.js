import makeWASocket, {
	Browsers,
	DisconnectReason,
	fetchLatestBaileysVersion,
	isJidBroadcast,
	isJidNewsletter,
	useMultiFileAuthState
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { MEDIA_DIR, saveMedia } from './media.js'
import { transcribe, transcriptionMode } from './transcribe.js'

const AUTH_DIR = process.env.AUTH_DIR || './auth'
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
// o logger interno do Baileys é muito verboso; só mostra avisos
const baileysLogger = logger.child({ module: 'baileys' }, { level: process.env.BAILEYS_LOG_LEVEL || 'warn' })

const MAX_BACKOFF_MS = 60_000
let attempts = 0
let reconnectTimer = null

async function start() {
	const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
	const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({}))
	if (version) logger.info({ version: version.join('.'), isLatest }, 'versão do WhatsApp Web')

	const sock = makeWASocket({
		...(version && { version }),
		auth: state,
		logger: baileysLogger,
		browser: Browsers.appropriate('Desktop'),
		// não aparecer "online" (o que poderia afetar notificações do celular)
		markOnlineOnConnect: false,
		// histórico antigo não interessa; só mensagens novas
		syncFullHistory: false,
		shouldSyncHistoryMessage: () => false,
		// ignora status, transmissões e canais
		shouldIgnoreJid: (jid) => isJidBroadcast(jid) || isJidNewsletter(jid),
		// nunca reenviamos nada, então não há mensagens a fornecer para retry
		getMessage: async () => undefined
	})

	sock.ev.on('creds.update', saveCreds)

	sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
		if (qr) {
			console.log('\nEscaneie o QR code no WhatsApp > Aparelhos conectados > Conectar um aparelho:\n')
			qrcode.generate(qr, { small: true })
			import('qrcode').then(m => m.default.toFile('/workspace/baileys-qr.png', qr, { width: 400 }))
		}
		if (connection === 'open') {
			attempts = 0
			logger.info({ user: sock.user?.id, mediaDir: MEDIA_DIR, transcricao: transcriptionMode || 'desativada' }, 'conectado')
		}
		if (connection === 'close') {
			const statusCode = lastDisconnect?.error?.output?.statusCode
			if (statusCode === DisconnectReason.loggedOut) {
				logger.error(`sessão encerrada pelo celular; apague ${AUTH_DIR} e rode de novo para gerar um novo QR`)
				process.exit(1)
			}
			scheduleReconnect(statusCode, lastDisconnect?.error?.message)
		}
	})

	sock.ev.on('messages.upsert', ({ messages, type }) => {
		// "notify" = mensagens novas em tempo real; "append" = sincronização/histórico
		if (type !== 'notify') return
		for (const msg of messages) {
			if (!msg.message || msg.key.fromMe) continue
			handleMedia(sock, msg)
		}
	})
}

async function handleMedia(sock, msg) {
	try {
		const saved = await saveMedia(sock, msg, baileysLogger)
		if (!saved) return
		logger.info({ remetente: saved.remetente, tipo: saved.tipo, caminho: saved.caminho }, 'mídia salva')

		if (transcriptionMode && (saved.tipo === 'audio' || saved.tipo === 'voz')) {
			transcribe(saved.absPath)
				.then((txt) => logger.info({ txt }, 'transcrição gerada'))
				.catch((err) => logger.warn({ err: err.message, arquivo: saved.caminho }, 'falha na transcrição'))
		}
	} catch (err) {
		logger.error({ err: err.message, id: msg.key.id }, 'falha ao baixar mídia')
	}
}

function scheduleReconnect(statusCode, reason) {
	if (reconnectTimer) return
	// 515 (restartRequired) acontece logo após escanear o QR: reconecta na hora
	const delay = statusCode === DisconnectReason.restartRequired
		? 0
		: Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts++)
	logger.warn({ statusCode, reason, delayMs: delay }, 'conexão fechada, reconectando')
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null
		start().catch((err) => {
			logger.error({ err: err.message }, 'erro ao reconectar')
			scheduleReconnect(undefined, err.message)
		})
	}, delay)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		logger.info('encerrando')
		process.exit(0)
	})
}

start().catch((err) => {
	logger.error({ err: err.message }, 'erro ao iniciar')
	scheduleReconnect(undefined, err.message)
})
