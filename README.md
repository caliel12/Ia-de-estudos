# IA de Estudos

Assistente de estudos para provas. O estudante informa a **data da prova** e os **materiais que o professor passou**, e o site monta um **passo a passo até o dia da prova**, com resumos, perguntas de revisão e vídeos.

Feito com HTML, CSS e JavaScript puro, sem dependências nem etapa de build. A IA é o **Google Gemini** (plano gratuito), chamada por uma função serverless da **Cloudflare Pages** (também gratuita) que guarda a chave da API fora do navegador.

**Site no ar:** <https://ia-de-estudos.pages.dev>

## Como funciona

1. **Escolha a data da prova**: matéria, data e quanto tempo você tem por dia.
2. **Adicione os materiais**: cole o conteúdo, envie PDFs (slides exportados em PDF), imagens, arquivos `.txt`/`.md` ou adicione links.
3. **Siga o plano**: um cronograma dia a dia com leitura, perguntas, vídeos, revisões espaçadas, um simulado na véspera e o progresso salvo no navegador.
4. **Estude com vídeo**: cole um link do YouTube para assistir no próprio site e tire dúvidas num chat com a IA, que usa os tópicos do seu plano como contexto.

A IA lê os materiais e devolve os tópicos, com resumo, perguntas e respostas e termos de busca de vídeo. O cronograma (datas, revisões, simulado) é calculado no navegador. Se a IA não estiver disponível (por exemplo, abrindo o `index.html` direto do disco), o site usa o **modo local**, que extrai os tópicos do texto colado.

## Estrutura

```
ia-de-estudos/
├── index.html          # Página inicial + formulário do planejador
├── css/
│   └── style.css       # Estilos (layout responsivo, tipografia, header/footer, impressão)
├── js/
│   ├── planejador.js   # Envio dos materiais, cronograma e exibição do plano
│   ├── estudo.js       # Player do YouTube e chat de dúvidas com a IA
│   └── main.js         # Ano dinâmico no rodapé, menu mobile
├── functions/
│   ├── _lib/
│   │   └── gemini.js       # Chamada ao Gemini compartilhada (modelos de reserva, erros)
│   └── api/
│       ├── gerar-plano.js  # POST /api/gerar-plano: tópicos, resumos e perguntas a partir dos materiais
│       └── perguntar.js    # POST /api/perguntar: chat de dúvidas
└── README.md
```

### Dica de formato do conteúdo

Use um tópico por linha ou títulos seguidos de texto. Frases do texto viram resumos e perguntas de completar lacunas:

```
# Citologia
A célula é a unidade básica da vida.
# Genética
Os genes são segmentos de DNA que carregam informações hereditárias.
3. Evolução
- Ecologia
```

## Como abrir localmente

**Sem IA (modo local):** abra o `index.html` com duplo clique ou use um servidor estático:

```bash
python3 -m http.server 8000   # depois acesse http://localhost:8000
```

**Com IA:** é preciso Node.js e uma chave gratuita do Gemini.

1. Crie a chave em <https://aistudio.google.com/apikey>.
2. Na raiz do projeto, crie o arquivo `.dev.vars` (ele já está no `.gitignore`, então não vai para o Git):
   ```
   GEMINI_API_KEY=sua-chave-aqui
   ```
3. Rode `npx wrangler pages dev .` e acesse <http://localhost:8788>.

## Publicar (Cloudflare Pages, gratuito)

1. No painel da Cloudflare, vá em **Workers & Pages → Create → Pages → Connect to Git** e escolha este repositório.
2. Configuração de build: **Framework preset** `None`, **Build command** vazio, **Build output directory** `/`.
3. Em **Settings → Variables and Secrets**, adicione `GEMINI_API_KEY` como **Secret** (Production e Preview).
4. Faça um novo deploy. Os arquivos em `functions/api/` viram automaticamente os endpoints `/api/gerar-plano` e `/api/perguntar`.

### Alternativa: publicar pelo terminal (Wrangler)

Sem conectar o Git, dá para publicar direto com um token da Cloudflare (`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no ambiente). Copie só os arquivos do site para uma pasta separada, para não publicar o `.dev.vars`:

```bash
mkdir -p deploy/public && cp -r index.html css js deploy/public/ && cp -r functions deploy/
cd deploy
npx wrangler pages project create ia-de-estudos --production-branch main   # só na primeira vez
npx wrangler pages secret put GEMINI_API_KEY --project-name ia-de-estudos     # só na primeira vez
npx wrangler pages deploy public --project-name ia-de-estudos --branch main
```

Variáveis opcionais:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Trocar o modelo (ex.: `gemini-3.5-flash-lite` para limites maiores) |

**Atenção ao plano gratuito do Gemini:** ele tem limite de requisições e às vezes fica sobrecarregado. Nesses casos a função tenta automaticamente os modelos de reserva (`gemini-3.5-flash` e `gemini-3.5-flash-lite`); se todos falharem, o site mostra um aviso e volta ao modo local. Além disso, o Google pode usar o conteúdo enviado para melhorar seus produtos. Não ative cobrança no projeto da chave se quiser garantir custo zero.

## Roadmap

- [x] Planejador local: data da prova, materiais, cronograma dia a dia, perguntas, vídeos e progresso
- [x] Integrar uma IA (Google Gemini) via função serverless, sem expor a chave no navegador
- [x] Ler PDFs e imagens dos materiais do professor
- [x] Gerar resumos e perguntas com resposta por tópico
- [x] Assistir vídeos do YouTube no site com chat de dúvidas com a IA
- [ ] Flashcards e questões de múltipla escolha com correção e explicação
- [ ] Proteger a função contra abuso (limite por usuário, Turnstile)
- [ ] Sugerir vídeos específicos (não só buscas no YouTube)
- [ ] Ajustar o plano conforme o desempenho do estudante nas perguntas
- [ ] Contas de usuário e vários planos/matérias ao mesmo tempo
- [ ] Publicar o site (ex.: GitHub Pages)
