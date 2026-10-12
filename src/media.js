import { createWriteStream } from 'node:fs'
import { access, appendFile, mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
	downloadMediaMessage,
	extractMessageContent,
	getContentType,
	isJidGroup
} from '@whiskeysockets/baileys'

export const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media')
const INDEX_FILE = path.join(MEDIA_DIR, 'index.jsonl')

// tipo de conteúdo do Baileys -> rótulo salvo no índice
const MEDIA_TYPES = {
	audioMessage: 'audio',
	imageMessage: 'imagem',
	videoMessage: 'video',
	ptvMessage: 'video', // "vídeo bolinha"
	documentMessage: 'documento'
}

const MIME_EXT = {
	'audio/ogg': 'ogg',
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a',
	'audio/aac': 'aac',
	'audio/amr': 'amr',
	'audio/wav': 'wav',
	'audio/webm': 'webm',
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/heic': 'heic',
	'video/mp4': 'mp4',
	'video/3gpp': '3gp',
	'video/quicktime': 'mov',
	'video/webm': 'webm',
	'application/pdf': 'pdf',
	'application/zip': 'zip',
	'text/plain': 'txt'
}

/** Retorna { contentType, tipo, media } se a mensagem for uma mídia tratada; senão null. */
export function getMediaInfo(msg) {
	const content = extractMessageContent(msg.message)
	const contentType = getContentType(content)
	const tipo = MEDIA_TYPES[contentType]
	if (!tipo) return null
	const media = content[contentType]
	if (contentType === 'audioMessage' && media.ptt) return { contentType, tipo: 'voz', media }
	return { contentType, tipo, media }
}

/** Remove a parte de dispositivo/servidor do JID: "5511999999999:12@s.whatsapp.net" -> "5511999999999" */
const jidUser = (jid) => (jid || '').split('@')[0].split(':')[0]

const sanitize = (s) => String(s).replace(/[^\w.+-]+/g, '_').replace(/^[._]+/, '').slice(0, 80) || 'desconhecido'

function pad(n) {
	return String(n).padStart(2, '0')
}

function formatDate(d) {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

function pickExtension(media, contentType) {
	if (contentType === 'documentMessage' && media.fileName) {
		const ext = path.extname(media.fileName).slice(1)
		if (ext) return sanitize(ext.toLowerCase())
	}
	const mime = (media.mimetype || '').split(';')[0].trim().toLowerCase()
	if (MIME_EXT[mime]) return MIME_EXT[mime]
	const sub = mime.split('/')[1]
	return sub ? sanitize(sub) : 'bin'
}

/**
 * Identifica remetente e pasta. Em Baileys 7 o JID pode vir como LID (@lid);
 * preferimos o número real (remoteJidAlt/participantAlt) quando disponível.
 */
function resolveContact(key) {
	const chat = key.remoteJidAlt || key.remoteJid
	if (isJidGroup(key.remoteJid)) {
		const sender = key.participantAlt || key.participant
		return { chat: key.remoteJid, remetente: jidUser(sender), pasta: `grupo_${jidUser(key.remoteJid)}` }
	}
	return { chat, remetente: jidUser(chat), pasta: jidUser(chat) }
}

const exists = (p) => access(p).then(() => true, () => false)

/**
 * Baixa a mídia de uma mensagem e registra no índice.
 * Retorna o registro gravado, ou null se a mensagem não é mídia / já foi salva.
 */
export async function saveMedia(sock, msg, logger) {
	const info = getMediaInfo(msg)
	if (!info) return null

	const { chat, remetente, pasta } = resolveContact(msg.key)
	const ts = Number(msg.messageTimestamp || 0)
	const date = ts ? new Date(ts * 1000) : new Date()
	const ext = pickExtension(info.media, info.contentType)

	const dir = path.join(MEDIA_DIR, sanitize(pasta))
	const file = path.join(dir, `${formatDate(date)}_${sanitize(msg.key.id)}.${ext}`)
	if (await exists(file)) return null

	await mkdir(dir, { recursive: true })
	const stream = await downloadMediaMessage(msg, 'stream', {}, {
		logger,
		reuploadRequest: sock.updateMediaMessage
	})
	try {
		await pipeline(stream, createWriteStream(file))
	} catch (err) {
		await unlink(file).catch(() => {})
		throw err
	}

	const record = {
		id: msg.key.id,
		remetente,
		nome: msg.pushName || null,
		chat,
		horario: date.toISOString(),
		tipo: info.tipo,
		mimetype: info.media.mimetype || null,
		nome_arquivo: info.media.fileName || null,
		caminho: path.relative(process.cwd(), file)
	}
	await appendFile(INDEX_FILE, JSON.stringify(record) + '\n')
	return { ...record, absPath: file }
}
