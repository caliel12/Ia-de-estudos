# IA de Estudos

Assistente de estudos para provas. O estudante informa a **data da prova** e os **materiais que o professor passou**, e o site monta um **passo a passo até o dia da prova**, com resumos, perguntas de revisão e vídeos.

Feito com HTML, CSS e JavaScript puro, sem dependências nem etapa de build.

## Como funciona

1. **Escolha a data da prova**: matéria, data e quanto tempo você tem por dia.
2. **Adicione os materiais**: cole o conteúdo, envie arquivos `.txt`/`.md` ou adicione links.
3. **Siga o plano**: um cronograma dia a dia com leitura, perguntas, vídeos, revisões espaçadas, um simulado na véspera e o progresso salvo no navegador.

> **Status:** protótipo. Por enquanto o plano é gerado localmente no navegador (`js/planejador.js`), sem IA. A função `gerarPlano` foi pensada para ser substituída por uma chamada a uma API de IA que devolva o mesmo formato de plano.

## Estrutura

```
ia-de-estudos/
├── index.html          # Página inicial + formulário do planejador
├── css/
│   └── style.css       # Estilos (layout responsivo, tipografia, header/footer, impressão)
├── js/
│   ├── planejador.js   # Geração e exibição do plano de estudos
│   └── main.js         # Ano dinâmico no rodapé, menu mobile
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

**Opção 1: direto no navegador.** Abra o arquivo `index.html` com duplo clique.

**Opção 2: servidor estático.**

```bash
# Python 3
python3 -m http.server 8000

# ou Node.js
npx serve .
```

Depois acesse <http://localhost:8000>.

## Roadmap

- [x] Planejador local: data da prova, materiais, cronograma dia a dia, perguntas, vídeos e progresso
- [ ] Integrar uma IA (modelo de linguagem) via backend/função serverless, sem expor a chave da API no navegador
- [ ] Ler PDFs, slides e imagens dos materiais do professor
- [ ] Gerar resumos, flashcards e questões de múltipla escolha com correção e explicação
- [ ] Sugerir vídeos específicos (não só buscas no YouTube)
- [ ] Ajustar o plano conforme o desempenho do estudante nas perguntas
- [ ] Contas de usuário e vários planos/matérias ao mesmo tempo
- [ ] Publicar o site (ex.: GitHub Pages)
