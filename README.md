# IA de Estudos

Assistente de estudos para provas. O estudante informa a **data da prova** e os **materiais que o professor passou**, e o site monta um **passo a passo até o dia da prova**, com resumos, perguntas de revisão e vídeos.

Feito com HTML, CSS e JavaScript puro, sem dependências nem etapa de build. A IA é o **Google Gemini** (plano gratuito), chamada por uma função serverless da **Cloudflare Pages** (também gratuita) que guarda a chave da API fora do navegador.

**Site no ar:** <https://ia-de-estudos.pages.dev>

## Como funciona

1. **Escolha a data da prova**: matéria, data e quanto tempo você tem por dia.
2. **Adicione os materiais**: cole o conteúdo, envie PDFs (slides exportados em PDF), imagens, arquivos `.txt`/`.md` ou adicione links.
3. **Siga o plano, uma etapa de cada vez**: cada tópico vem com resumo, explicação completa, exemplo resolvido, macete, erros comuns, perguntas de revisão e vídeos. Só a etapa de agora fica aberta; as próximas aparecem bloqueadas (só o título) até você concluir a atual. Ao concluir, o site te parabeniza e sugere uma pausa até o dia seguinte (dá para continuar mesmo assim). O progresso fica salvo no navegador (e na conta, se você entrar).
4. **Faça os mini simulados**: no fim de cada etapa de estudo tem um mini simulado (e um simulado geral na véspera da prova). A IA cria as questões na hora, corrige, dá a nota e explica onde você foi mal e o que revisar. Os pontos fracos viram um reforço no começo das próximas etapas e caem mais no simulado geral.
5. **Pergunte à IA durante o plano**: o botão **Perguntar à IA** da etapa aberta abre um chat (gaveta lateral no computador, folha de baixo no celular) que já sabe qual etapa você está estudando e como foi no último simulado.
6. **Tire dúvidas de tudo da escola**: o chat com a IA ajuda com qualquer matéria, lições de casa, trabalhos, redação, provas e organização dos estudos. Em lições e trabalhos ele explica o passo a passo para você chegar na resposta (e confere a sua), em vez de só entregar a resposta pronta. Como contexto, ele usa a **agenda** (provas, lições e trabalhos com data, para responder "o que eu tenho essa semana?" ou "o que estudo primeiro?") e os tópicos do **plano de estudos**.
7. **Estude com vídeo**: cole um link do YouTube para assistir no próprio site; a IA do chat assiste ao vídeo junto com você (vídeos públicos). O botão "Resumir o vídeo" pede um resumo dos pontos principais. Se o vídeo não puder ser lido (privado ou longo demais), a IA responde sem ele e avisa.

A IA lê os materiais e devolve os tópicos, com resumo, perguntas e respostas e termos de busca de vídeo. O cronograma (datas, revisões, simulado) é calculado no navegador. Se a IA não estiver disponível (por exemplo, abrindo o `index.html` direto do disco), o site usa o **modo local**, que extrai os tópicos do texto colado.

## Plano de estudos e simulados

- **Conteúdo por tópico** (`functions/api/gerar-plano.js`): resumo, explicação em parágrafos, exemplo resolvido, macete, erros comuns, perguntas com resposta e busca de vídeo. No modo local, o resumo e a explicação saem do texto colado.
- **Uma etapa por vez** (`js/planejador.js`): concluídas ficam recolhidas (com a nota do simulado), a atual fica aberta e as futuras ficam bloqueadas. Depois de concluir, aparece a pausa "volta amanhã" (`plano.descansoAte`) com o botão **Continuar mesmo assim**.
- **Simulados** (`js/simulado.js`): gerados só quando o estudante clica em **Começar simulado**, para não deixar a criação do plano lenta. Mini simulado = 4 de múltipla escolha + 1 discursiva (`POST /api/gerar-simulado`, tipo `topico`); simulado geral = 8 + 2 (tipo `final`), com cerca de metade das questões nos pontos fracos. Uma questão por tela; as respostas ficam salvas enquanto o estudante responde.
- **Correção** (`POST /api/corrigir-simulado`): a múltipla escolha é conferida pelo gabarito; a IA corrige as discursivas (1, 0,5 ou 0), explica cada erro e diz o que revisar. Tópicos abaixo de 70% viram **pontos fracos**, que aparecem como "Reforço antes de começar" nas etapas seguintes e pesam mais no simulado geral.
- **Sem IA**: o simulado é montado no navegador com as perguntas de revisão e o texto do plano, corrigido automaticamente e com um aviso de que não tem explicação personalizada. Se só a correção falhar, a nota sai da múltipla escolha e as discursivas mostram a resposta esperada.
- **Chat do plano** (`js/plano-chat.js`): usa `POST /api/perguntar` com o campo `etapa` (título, tópicos com resumo e o último simulado: nota, erros e o que revisar), além da idade e da agenda. O histórico é separado do chat da tela "Estudar com vídeo".
- **Onde fica salvo**: tudo no próprio plano (`localStorage["ia-de-estudos:plano"]`): `concluidos`, `descansoAte` e `simulados[índiceDaEtapa]` (questões, respostas e resultado). Toda mudança passa por `salvar()`, que dispara `ia-de-estudos:dados-alterados` para sincronizar com a conta. Se o plano passar de ~450 KB, as questões dos simulados mais antigos são apagadas (o resultado fica). Planos salvos antes dessa versão abrem normalmente.

## Jeito de falar da IA

Antes de criar o plano, o site pergunta a **idade** do estudante (fica salva no navegador e na conta). A IA fala de um jeito informal, como um colega mais velho explicando, e ajusta as palavras e os exemplos à idade, tanto no plano quanto no chat. As regras ficam em `functions/_lib/tom.js`.

## Conta (login opcional)

No botão **Entrar** do topo dá para criar uma conta com e-mail e senha. Com ela, a agenda, o plano e a idade ficam salvos no servidor e aparecem em qualquer celular ou computador. Sem entrar, tudo continua funcionando e fica salvo só no navegador.

- No primeiro login, o que já estava no navegador é juntado ao que está na conta. Depois, cada mudança é enviada sozinha (`js/conta.js`).
- Ao sair, a agenda e o plano são apagados daquele navegador, mas continuam na conta.
- As senhas são guardadas com PBKDF2 (SHA-256, 100 mil iterações, sal aleatório). A sessão é um cookie `HttpOnly`/`Secure` de 30 dias e só o hash do token fica no servidor. Há limite de tentativas de login (10 a cada 15 minutos por e-mail).
- Os dados ficam num **Cloudflare KV** ligado ao projeto como `CONTAS`. Ainda não existe "esqueci a senha".

## Agenda escolar

Na seção **Agenda** dá para anotar provas, lições de casa e trabalhos (tipo, título, matéria, data, hora e observação). A lista fica em ordem de prazo, com rótulos como "Amanhã" ou "Atrasado há 2 dias" e uma faixa de avisos com o que vence em até 3 dias. Tudo fica salvo no navegador (`localStorage`).

- **Ativar avisos**: notificações do navegador para itens atrasados ou que vencem hoje/amanhã (provas: até 3 dias antes), no máximo uma vez por dia por item. Só funcionam com o site aberto; o `sw.js` serve apenas para mostrar e abrir essas notificações (sem cache offline).
- **Google Agenda** e **Baixar lembrete (.ics)**: para ser lembrado com o site fechado. O `.ics` traz alarme 1 dia antes (provas também 3 dias antes) e pode ser importado no celular.
- Em provas, **Criar plano de estudos** preenche matéria e data no planejador.
- `window.IAEstudosAgenda.paraIA()` devolve os itens pendentes (atrasados e dos próximos 30 dias) para o chat da IA.

## Estrutura

```
ia-de-estudos/
├── index.html          # Página inicial + formulário do planejador
├── css/
│   ├── style.css       # Estilos (layout responsivo, tipografia, header/footer, impressão)
│   └── agenda.css      # Estilos da agenda
├── js/
│   ├── planejador.js   # Envio dos materiais, cronograma e plano em etapas (bloqueio, pausa, progresso)
│   ├── simulado.js     # Mini simulados e simulado geral: questões, correção, reforço dos pontos fracos
│   ├── plano-chat.js   # Gaveta "Perguntar à IA" com o contexto da etapa aberta
│   ├── agenda.js       # Agenda de provas/lições com lembretes (.ics, Google Agenda, notificações)
│   ├── estudo.js       # Player do YouTube e chat da escola com a IA
│   ├── etapas.js       # Plano em 3 passos (idade, matéria e data; materiais; revisar)
│   ├── conta.js        # Login opcional e envio da agenda/plano para a conta
│   └── main.js         # Ano dinâmico no rodapé, menu mobile
├── sw.js               # Service worker mínimo para as notificações da agenda
├── functions/
│   ├── _lib/
│   │   ├── gemini.js       # Chamada ao Gemini compartilhada (modelos de reserva, erros)
│   │   ├── tom.js          # Jeito de falar da IA conforme a idade
│   │   ├── simulado.js     # Validação e limites compartilhados dos simulados
│   │   └── conta.js        # Senhas, sessões e limite de tentativas (KV CONTAS)
│   └── api/
│       ├── conta/          # /api/conta/criar, entrar, sair, eu e dados (GET/PUT)
│       ├── gerar-plano.js       # POST /api/gerar-plano: tópicos com explicação, exemplo, macete e perguntas
│       ├── gerar-simulado.js    # POST /api/gerar-simulado: questões do mini simulado ou do simulado geral
│       ├── corrigir-simulado.js # POST /api/corrigir-simulado: nota, erros explicados e o que revisar
│       └── perguntar.js         # POST /api/perguntar: chat da escola (usa agenda, plano, etapa e vídeo)
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
3. Rode `npx wrangler pages dev . --kv CONTAS` e acesse <http://localhost:8788>. O `--kv CONTAS` cria um KV local para as contas.

## Publicar (Cloudflare Pages, gratuito)

1. No painel da Cloudflare, vá em **Workers & Pages → Create → Pages → Connect to Git** e escolha este repositório.
2. Configuração de build: **Framework preset** `None`, **Build command** vazio, **Build output directory** `/`.
3. Em **Settings → Variables and Secrets**, adicione `GEMINI_API_KEY` como **Secret** (Production e Preview).
4. Em **Settings → Bindings**, crie um **KV namespace** (ex.: `ia-de-estudos-contas`) e ligue como `CONTAS` (Production e Preview). Sem ele, o botão Entrar não aparece.
5. Faça um novo deploy. Os arquivos em `functions/api/` viram automaticamente os endpoints `/api/gerar-plano` e `/api/perguntar`.

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
- [x] Mini simulados (múltipla escolha + discursivas) com correção e explicação da IA
- [ ] Flashcards
- [ ] Proteger a função contra abuso (limite por usuário, Turnstile)
- [ ] Sugerir vídeos específicos (não só buscas no YouTube)
- [x] Reforço dos pontos fracos dos simulados nas próximas etapas e no simulado geral
- [x] Contas de usuário (e-mail e senha) com agenda e plano salvos na conta
- [ ] Recuperar a senha por e-mail ou entrar com Google
- [ ] Vários planos/matérias ao mesmo tempo
- [ ] Publicar o site (ex.: GitHub Pages)
