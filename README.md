# Projeto TJSP

Gerente de estudos adaptativo para o concurso de **Escrevente Técnico Judiciário do TJSP** (Edital 02/2026, prova em 14/03/2027).
Ao abrir, mostra a **MISSÃO DE HOJE** já decidida: o que estudar, por quanto tempo, quantas questões e o que revisar.

- Arquitetura, banco de dados e algoritmos: [`DESIGN.md`](DESIGN.md)
- Conteúdo do edital: `src/data/edital.ts` · DNA VUNESP: `src/data/vunesp.ts`
- Motor de decisão (funções puras, testadas): `src/engine/`
- Telas: `src/ui/` · Estado e persistência: `src/state/`

## Rodar

```bash
npm install
npm run dev        # desenvolvimento em http://localhost:5173
npm test           # testes do motor
npm run build      # gera dist/index.html (arquivo único, abre direto no navegador)
npm run artifact   # gera artifact/projeto-tjsp.html para publicar no claude.ai
```

`dist/index.html` funciona sozinho: pode ser aberto localmente ou hospedado de graça (GitHub Pages, Netlify).
Os dados ficam no navegador (IndexedDB). Faça backup em **Ajustes → Exportar backup**.

## Site no ar

Publicado automaticamente pelo GitHub Pages a cada envio para `main`:
**https://viniciusrisse.github.io/TJSP/**
