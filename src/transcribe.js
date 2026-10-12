import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Transcrição opcional de áudios, controlada por WHISPER_MODE:
 *   (vazio) -> desativado
 *   openai  -> API /audio/transcriptions (OPENAI_API_KEY, OPENAI_BASE_URL, WHISPER_MODEL)
 *   local   -> CLI `whisper` (openai-whisper) ou compatível (WHISPER_BIN, WHISPER_MODEL)
 * Gera <arquivo>.txt ao lado do áudio (mesmo nome, extensão .txt).
 */
export const transcriptionMode = (process.env.WHISPER_MODE || '').trim().toLowerCase()

const txtPathFor = (audioPath) => audioPath.replace(/\.[^./]+$/, '') + '.txt'

async function transcribeOpenAI(audioPath) {
	const apiKey = process.env.OPENAI_API_KEY
	if (!apiKey) throw new Error('WHISPER_MODE=openai mas OPENAI_API_KEY não definido')
	const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')

	const form = new FormData()
	form.append('file', new Blob([await readFile(audioPath)]), path.basename(audioPath))
	form.append('model', process.env.WHISPER_MODEL || 'whisper-1')
	form.append('response_format', 'text')
	if (process.env.WHISPER_LANGUAGE) form.append('language', process.env.WHISPER_LANGUAGE)

	const res = await fetch(`${baseUrl}/audio/transcriptions`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}` },
		body: form
	})
	const body = await res.text()
	if (!res.ok) throw new Error(`API respondeu ${res.status}: ${body.slice(0, 300)}`)
	return body.trim()
}

async function transcribeLocal(audioPath) {
	const bin = process.env.WHISPER_BIN || 'whisper'
	const dir = path.dirname(audioPath)
	const args = [
		audioPath,
		'--model', process.env.WHISPER_MODEL || 'base',
		'--output_format', 'txt',
		'--output_dir', dir
	]
	if (process.env.WHISPER_LANGUAGE) args.push('--language', process.env.WHISPER_LANGUAGE)
	// o CLI grava <nome-sem-ext>.txt no output_dir, ou seja, ao lado do áudio
	await execFileAsync(bin, args, { maxBuffer: 64 * 1024 * 1024 })
}

/** Transcreve o áudio e grava o .txt. Retorna o caminho do .txt, ou null se desativado. */
export async function transcribe(audioPath) {
	if (!transcriptionMode) return null
	const txtPath = txtPathFor(audioPath)
	if (transcriptionMode === 'openai') {
		await writeFile(txtPath, (await transcribeOpenAI(audioPath)) + '\n')
	} else if (transcriptionMode === 'local') {
		await transcribeLocal(audioPath)
	} else {
		throw new Error(`WHISPER_MODE desconhecido: "${transcriptionMode}" (use openai, local ou deixe vazio)`)
	}
	return txtPath
}
