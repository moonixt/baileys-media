---
name: WhatsApp áudio e mídia (Baileys)
description: >-
  Use when a bot needs to receive WhatsApp media (voice notes, images, videos,
  documents) via a Baileys connector, show the pairing QR code in the Grok Bot
  chat, and transcribe received audios to text for free with faster-whisper.
---
# WhatsApp áudio e mídia (Baileys)

Conector Node.js (Baileys) que só recebe mídia: salva áudio/voz, imagem, vídeo e documento em `media/<numero>/<data>_<id>.<ext>` e registra em `media/index.jsonl` (remetente, nome, horário, tipo, caminho). Não trata texto, nunca envia mensagens e nunca marca como lido.

Pacote pronto: `/home/box/shared/baileys-media.tgz` (sem node_modules, auth e media).

## Avisos para o cliente
- O Baileys não é oficial: há risco de bloqueio do número. Prefira um número separado do principal.
- O conector precisa ficar rodando num computador sempre ligado (ideal: VPS). O computador do bot serve para teste.

## 1. Instalar
1. `cd /workspace && tar xzf /home/box/shared/baileys-media.tgz && cd baileys-media`
2. Precisa de Node 22+: se `node --version` for menor, `npx -y n 22 && hash -r`.
3. `npm install && npm i qrcode`

## 2. Conectar mostrando o QR no chat
O `src/index.js` já salva o QR como imagem em `/workspace/baileys-qr.png` além de imprimir no terminal.
1. `rm -f /workspace/baileys-qr.png && nohup npm start > /workspace/baileys.log 2>&1 &`
2. Espere uns 10 s e confira se o PNG existe.
3. Envie o PNG no chat (SendToUser com images: file:///workspace/baileys-qr.png) pedindo para escanear em WhatsApp > Aparelhos conectados > Conectar um aparelho. O QR expira em ~20 s; se expirar, um novo PNG é gerado sozinho, então reenvie.
4. Confirme a conexão: `grep '"conectado"' /workspace/baileys.log`. Erros de sync/decrypt logo após conectar são normais.
5. A sessão fica em `./auth`; nas próximas vezes não pede QR. Se o aparelho for desconectado pelo celular, apague `./auth` e repita.

## 3. Conferir mídias recebidas
`grep '"mídia salva"' /workspace/baileys.log | tail` mostra remetente, tipo e caminho.

## 4. Transcrever áudios (grátis, local)
1. Uma vez: `python3 -m venv /workspace/whisper-venv && /workspace/whisper-venv/bin/pip install -q faster-whisper`
2. Transcrever (decodifica com ffmpeg para evitar incompatibilidade do PyAV):
```bash
f=CAMINHO_DO_OGG
/workspace/whisper-venv/bin/python -c "
import subprocess,numpy as np
from faster_whisper import WhisperModel
raw=subprocess.run(['ffmpeg','-loglevel','quiet','-i','$f','-f','f32le','-ac','1','-ar','16000','-'],capture_output=True).stdout
a=np.frombuffer(raw,np.float32)
m=WhisperModel('small',device='cpu',compute_type='int8')
s,_=m.transcribe(a,language='pt')
print(' '.join(x.text.strip() for x in s))"
```
Modelo `small` (~500 MB) transcreve áudio curto em ~3 s na CPU. Se a precisão estiver ruim, use `medium`.

## 5. Responder ao usuário
Informe quem mandou (número/pasta), horário e o texto transcrito. Nunca responda no WhatsApp sozinho.
