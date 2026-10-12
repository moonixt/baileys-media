# baileys-media

Conector de WhatsApp em Node.js com [Baileys](https://github.com/WhiskeySockets/Baileys) que **só arquiva mídias recebidas**:
áudio/voz, imagem, vídeo e documento.

- Conecta via QR code no terminal e guarda a sessão em `./auth`, então o QR só é pedido na primeira vez.
- Ignora mensagens de texto, status, listas de transmissão, canais e mensagens enviadas por você.
- **Nunca envia mensagens e nunca marca nada como lido.** Também não fica "online" (`markOnlineOnConnect: false`).
  O WhatsApp ainda recebe a confirmação de *entregue* (✓✓ cinza), como em qualquer aparelho conectado.
- Reconecta sozinho se a conexão cair, com espera crescente até 60 s.
- Transcrição opcional de áudios com Whisper (API da OpenAI ou CLI local).

## Requisitos

- Node.js 22 ou mais recente
- (Opcional) para transcrição local: `pip install openai-whisper` e `ffmpeg`

## Instalação

```bash
npm install
cp .env.example .env   # opcional; edite se for usar transcrição
```

## Uso

```bash
npm start
```

Na primeira execução aparece um QR code no terminal. No celular, abra
**WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho** e escaneie.
Depois disso a sessão fica em `./auth` e não precisa escanear de novo.

Se você desconectar o aparelho pelo celular, o programa avisa e encerra. Apague a pasta
`./auth` e rode `npm start` de novo para gerar um novo QR.

## Onde ficam os arquivos

```
media/
├── index.jsonl
├── 5511999999999/
│   ├── 2026-10-12_14-03-22_3EB0A1B2C3D4.ogg
│   ├── 2026-10-12_14-03-22_3EB0A1B2C3D4.txt   ← transcrição (se ativada)
│   └── 2026-10-12_14-05-10_3EB0FFEE0011.jpg
└── grupo_120363000000000000/
    └── 2026-10-12_15-00-00_ABCDEF123456.pdf
```

- Conversas individuais ficam numa pasta com o número do contato. Grupos ficam em `grupo_<id>`.
- A data vem do horário da mensagem, no fuso local. O id é o da mensagem no WhatsApp.
  Se a mesma mensagem chegar duas vezes, ela não é baixada de novo.
- A extensão vem do nome original do documento ou do mimetype.

Cada mídia salva gera uma linha em `media/index.jsonl`:

```json
{"id":"3EB0A1B2C3D4","remetente":"5511999999999","nome":"Fulano","chat":"5511999999999@s.whatsapp.net","horario":"2026-10-12T17:03:22.000Z","tipo":"voz","mimetype":"audio/ogg; codecs=opus","nome_arquivo":null,"caminho":"media/5511999999999/2026-10-12_14-03-22_3EB0A1B2C3D4.ogg"}
```

`tipo` pode ser `audio`, `voz` (mensagem de voz gravada no app), `imagem`, `video` ou `documento`.
Em grupos, `remetente` é quem enviou e `chat` é o grupo.

> Nas versões novas do WhatsApp alguns contatos aparecem só com um identificador anônimo (LID, `@lid`)
> no lugar do número. Quando o WhatsApp informa o número real, ele é usado. Caso contrário, a pasta
> recebe o LID.

## Transcrição de áudio (opcional)

Ela é configurada no `.env` pela variável `WHISPER_MODE`. Se estiver vazia, os áudios são salvos sem transcrição.

| `WHISPER_MODE` | O que faz | Variáveis |
|---|---|---|
| *(vazio)* | desativado | — |
| `openai` | envia o áudio para `/audio/transcriptions` | `OPENAI_API_KEY`, `WHISPER_MODEL` (padrão `whisper-1`), `OPENAI_BASE_URL` (para APIs compatíveis, ex. Groq) |
| `local` | roda o CLI `whisper` na máquina | `WHISPER_BIN` (padrão `whisper`), `WHISPER_MODEL` (padrão `base`) |

`WHISPER_LANGUAGE` (ex.: `pt`) é opcional e vale para os dois modos.

O resultado é gravado num `.txt` com o mesmo nome do áudio, na mesma pasta. Uma falha na
transcrição só gera um aviso no log, e o áudio continua salvo.

## Outras variáveis

| Variável | Padrão | Descrição |
|---|---|---|
| `AUTH_DIR` | `./auth` | pasta da sessão |
| `MEDIA_DIR` | `./media` | pasta das mídias e do `index.jsonl` |
| `LOG_LEVEL` | `info` | log do conector |
| `BAILEYS_LOG_LEVEL` | `warn` | log interno do Baileys |

## Estrutura

- `src/index.js`: conexão, QR, reconexão e filtro de mensagens
- `src/media.js`: identifica o tipo de mídia, baixa com `downloadMediaMessage` e grava o índice
- `src/transcribe.js`: transcrição opcional com Whisper

> Aviso: o Baileys não é uma API oficial do WhatsApp. Use com uma conta sua e com moderação.

## Licença

Artificial Manufactory Subscription License: uso permitido apenas para assinantes ativos. Veja [LICENSE](LICENSE).
