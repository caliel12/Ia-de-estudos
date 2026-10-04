# IA de Estudos

Site estático dedicado a estudos sobre **inteligência artificial**: conceitos, artigos, tutoriais e recursos para aprender IA de forma progressiva.

Feito com HTML, CSS e JavaScript puro — sem dependências nem etapa de build.

## Estrutura

```
ia-de-estudos/
├── index.html      # Página inicial
├── css/
│   └── style.css   # Estilos (layout responsivo, tipografia, header/footer)
├── js/
│   └── main.js     # Scripts (ano dinâmico no rodapé, menu mobile)
└── README.md
```

## Como abrir localmente

**Opção 1 — direto no navegador:** abra o arquivo `index.html` com duplo clique.

**Opção 2 — servidor estático** (recomendado quando houver carregamento de arquivos via `fetch`):

```bash
# Python 3
python3 -m http.server 8000

# ou Node.js
npx serve .
```

Depois acesse <http://localhost:8000>.

## Roadmap

- [ ] Publicar os primeiros artigos (fundamentos de IA, aprendizado de máquina, redes neurais)
- [ ] Criar tutoriais práticos (ex.: primeiro modelo com Python, introdução a LLMs)
- [ ] Montar uma página de recursos (livros, cursos, ferramentas, datasets)
- [ ] Carregar conteúdo a partir de arquivos JSON/Markdown
- [ ] Adicionar busca e filtros por tema
- [ ] Modo escuro
- [ ] Publicar o site (ex.: GitHub Pages)
