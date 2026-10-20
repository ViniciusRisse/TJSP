# PROJETO TJSP — Documento de arquitetura

Sistema pessoal de gestão adaptativa de estudos para o concurso de **Escrevente Técnico Judiciário do TJSP**
(Edital de Abertura nº 02/2026 — 2ª a 10ª RAJ; prova objetiva + redação em **14/03/2027**, período vespertino, 5h).
Região escolhida: **5ª Circunscrição Judiciária — Jundiaí (4ª RAJ)**. A opção de comarca não vincula a nomeação
(cap. II, 3.5.1): a nomeação pode ocorrer em qualquer comarca da circunscrição.

Fontes usadas para montar o banco de conteúdo:

| Fonte | Uso |
|---|---|
| Edital 02/2026, cap. IX, X, XI, XVII e Anexo VIII | Estrutura da prova, critérios, conteúdo programático, regras da redação |
| "Raio-X VUNESP – Escrevente TJSP" (estudo de 20/10/2026) | Frequência histórica por tema, pegadinhas, dispositivos repetidos, tendências |
| Cadernos TJSP 2018 (tjsp1704), 2021 (TJSP2101), 2025 (TJSP2503) | Referência de questões reais (número da questão por tema) e proposta de redação 2025 |

---

## 1. Arquitetura proposta

**Aplicação web estática (SPA), local-first, sem backend.**

```
┌──────────────────────────── Navegador (PC ou celular) ────────────────────────────┐
│  UI React (telas)                                                                   │
│     │                                                                               │
│  Store (estado único + ações)  ──►  Motor de decisão (funções puras, testadas)     │
│     │                                   mastery · priority · phase · mission        │
│     │                                   review · absence · risk · metrics · weekly  │
│     ▼                                                                               │
│  Persistência: IndexedDB (principal) + localStorage (espelho de segurança)          │
│     │                                                                               │
│     ├─► Exportar/Importar backup JSON (arquivo)                                     │
│     └─► Sincronização opcional entre aparelhos (desligada por padrão)               │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

* **React 18 + TypeScript + Vite**, empacotado em **um único arquivo HTML** (sem servidor, sem custo mensal).
  Pode ser aberto como Artifact no claude.ai, hospedado grátis (GitHub Pages/Netlify) ou aberto localmente.
* **Motor de decisão separado da interface**: todos os algoritmos são funções puras em `src/engine/`, com testes
  automatizados (`npm test`). Nada de regra crítica escondida em tela.
* **Dados locais**: nada é enviado a serviços externos. Não há API paga. Backup/exportação em JSON a qualquer momento.
* **Sincronização opcional** (PC ↔ celular): quando publicada como Artifact, a usuária pode ligar a sincronização,
  que grava uma cópia do estado na área privada dela (`data/users/<id>`), visível apenas para ela.
* **Configuração editável**: data da prova, região, dias de estudo, tempo por dia da semana, pesos da prioridade,
  ritmo de questões, duração de blocos, intervalos de revisão, distribuição da prova, metas. Nada crítico fica fixo no código:
  os valores do edital ficam como *padrão* em `src/data/` e são copiados para a configuração da usuária.

## 2. Estrutura do banco de dados

Um único documento de estado versionado (`schemaVersion`) com coleções. Entidades:

| Entidade | Campos principais |
|---|---|
| **USER** | nome, região, circunscrição, criadoEm, últimoAcesso, modo de sincronização |
| **EXAM** | data, duração, nº de questões, blocos (questões, eliminatório, mínimo %), nota mínima geral, redação (escala, mínimo, linhas), meta pessoal |
| **DISCIPLINE** | id, bloco, nome, questões na prova, lei/fonte, cor, ordem, ativo |
| **TOPIC** | id, disciplina, nome, artigos, referência do edital, frequência histórica, peso estimado de questões, tipo de cobrança, pegadinhas, nível base, ordem de progressão, links |
| **SUBTOPIC** | id, tópico, nome, artigos/conteúdo específico, nota (ex.: "conferir vigência") |
| **QUESTION** | id, fonte (QConcursos/prova anterior/apostila), código externo, banca, ano, disciplina, tópico, enunciado opcional |
| **QUESTION_ATTEMPT** | id, questão?, tópico, data, classificação (7 tipos), tempo, dificuldade percebida, origem (missão/simulado/avulsa) |
| **ERROR** | id, tentativa, tópico, minha resposta, resposta correta, motivo, explicação, regra correta, pegadinha, data, contagem do conceito, recorrente |
| **REVIEW** | tópico, estágio, intervalo atual, facilidade, próxima data, histórico de resultados |
| **STUDY_SESSION** | id, data, tópico, tipo (teoria/questões/revisão/flashcards/redação/simulado), minutos, ligada à missão? |
| **DAILY_MISSION** | data, tempo disponível, humor, fase, tarefas (tipo, tópico, minutos, nº de questões, instruções, onde estudar, estado), motivo da escolha |
| **SIMULATION** | id, tipo (mini/parcial/completo), distribuição, tempo, fonte sugerida, data |
| **SIMULATION_RESULT** | simulado, acertos por disciplina, tempo gasto, nota da redação (autoavaliação), nota 0–10, aprovado nos blocos eliminatórios |
| **FLASHCARD** | id, tópico, frente, verso, origem (erro/lei/prazo/exceção/par confuso), caixa, próxima data |
| **MATERIAL** | id, tipo (lei seca/QConcursos/apostila/vídeo/prova anterior), título, onde encontrar, URL, disciplina/tópico |
| **VUNESP_PATTERN** | id, nome da pegadinha, como aparece, exemplos reais (prova/questão), defesa, disciplinas |
| **PERFORMANCE_METRIC** | fotografias semanais: domínio por tópico/disciplina, acerto, projeção por bloco, horas |
| **WEEKLY_REPORT** | semana, resumo, ajustes de prioridade aplicados |
| **ESSAY** (redação) | data, fase, tema, linhas, autoavaliação por critério, checagem de anulação |

## 3. Lógica de priorização

Para cada tópico, a prioridade (0–100) é recalculada sempre que o estado muda:

```
P = gate_edital × modFase × Σ (peso_i × fator_i)

fator_hist   = provas em que o tema apareceu / provas analisadas (mín. 0,15 se está no edital e nunca caiu)
fator_prova  = questões esperadas do tópico na prova / 2 (limitado a 1)
fator_fraco  = 1 − domínio/100              (tópico não iniciado conta como domínio baixo)
fator_erros  = erros nos últimos 14 dias / 5 (limitado a 1) + 0,3 se há ERRO RECORRENTE
fator_revisão= dias desde o último contato / intervalo atual (limitado a 1)
fator_elim   = 0,5 para blocos I e II + risco do bloco (quanto a projeção está perto/abaixo de 50%)
fator_banca  = peso do tipo de cobrança × fraqueza no Nível B (reconhecimento de pegadinha)
modFase      = na reta final, conteúdo novo de baixa incidência perde peso; Atualidades ganha peso aos poucos
```

Pesos padrão (editáveis): histórico 22, prova 18, fraqueza 22, erros 10, revisão 10, eliminatório 10, tipo de cobrança 8.
A **proximidade da prova** entra pela fase (seção 6) e pelo `modFase`.

Exemplos: muito cobrado + 40% de acerto → prioridade muito alta; muito cobrado + 90% → cai, mas continua na fila de
revisão; pouco cobrado + 95% → baixa. Cada recomendação mostra **por que** foi escolhida (os 2–3 fatores mais fortes).

**Domínio (0–100)** não é só percentual de acerto:

```
valor da tentativa: 🟢 1,0 · 🟠 0,6 · 🟡 0,25 (chute não é domínio) · 🔴🔵🟣⚫ 0
peso da tentativa : 0,5^(idade em dias / 30) × fator de dificuldade
domínio           = (Σ peso×valor + 0,3×5) / (Σ peso + 5)  − penalidade de erro recorrente
```

O termo "+5 tentativas fictícias a 30%" impede que 3 acertos virem "90% de domínio". Tentativas antigas perdem peso
(esquecimento). Faixas: 0–20 desconhecido · 21–40 muito fraco · 41–60 fraco · 61–70 em desenvolvimento · 71–80 bom ·
81–90 forte · 91–100 muito forte. Para Direito, o sistema separa **Nível A (conhecimento)** — erros 🔴 — de
**Nível B (reconhecimento)** — erros ⚫🔵🟣 e acertos com dúvida.

## 4. Algoritmo da missão diária

Pergunta central: *qual atividade mais aumenta a chance de aprovação com o tempo que existe hoje?*

1. Entrada: tempo disponível (20m/40m/1h/1h30/2h/3h+ ou outro), estado (normal/cansada/muito mal), data.
2. **Detecção de retorno** (seção 6). Se houver retorno, aplica o protocolo de retomada.
3. **Modo mínimo**: "muito mal" ou ≤ 20 min → revisão curta + 8–10 questões do tópico prioritário + correção dos erros.
   "Cansada" → tempo × 0,75 e sem conteúdo novo.
4. **Divisão do tempo pela fase** (novo / questões+correção / revisão+flashcards / redação):
   F1 40/35/15/10 · F2 25/45/20/10 · F3 15/50/20/15 · F4 5/50/25/20 · F5 0/45/40/15.
5. **Escolha do tópico principal** = maior prioridade, com regra de ciclo adaptativo: evita repetir a disciplina de
   ontem, a menos que ela seja claramente a melhor opção (25% acima da segunda); penaliza disciplinas que já
   receberam mais do que a parte justa delas na semana.
6. Com ≥ 1h, entra um **tópico secundário** de outro bloco (geralmente RLM/Português/Informática, intercalado).
   Com ≥ 2h, um terceiro bloco.
7. Nº de questões = minutos ÷ ritmo da disciplina (Direito 2,5 min, Português 3, RLM/Matemática 4, Informática 2).
   Correção ativa ≈ 1 min por questão (mínimo 5).
8. Revisões vencidas e flashcards entram no bloco de revisão, ordenadas por prioridade (fila, nunca "dívida").
9. Redação entra pelo calendário da fase (1 exercício por semana) em dias com ≥ 1h30. Simulado entra quando está
   previsto e o dia tem tempo suficiente (≥ 3h para completo).
10. Cada tarefa traz: o que fazer, quanto, **onde** (artigos + link da lei seca, filtro do QConcursos, capítulo da
    apostila, questão da prova anterior) e o motivo.

## 5. Algoritmo de revisão

Por tópico (REVIEW):
* Intervalos base: 1 → 7 → 21 → 45 → 90 dias (editáveis), multiplicados pela facilidade (1,3–2,5).
* Depois de cada contato com o tópico, o resultado define o próximo passo:
  * ≥ 85% e sem chutes → avança estágio, facilidade +0,1;
  * 60–84% → mantém estágio;
  * < 60% → volta ao estágio 1 (revisão em 1–3 dias), facilidade −0,2.
* Revisões vencidas formam uma **fila priorizada**, com teto diário. Itens muito vencidos (mais de 2× o intervalo) viram
  uma "checagem rápida" (5 questões) em vez de revisão completa. Nada se acumula.

Flashcards (FLASHCARD): caixas de Leitner 1/3/7/15/30/60 dias; respostas Errei/Difícil/Acertei/Fácil.
São criados automaticamente a partir de erros registrados (regra correta, pegadinha, par confuso, prazo/número).

## 6. Algoritmo de adaptação após ausência

**Não existe atraso acumulado.** O sistema nunca calcula "dias perdidos".

* Intervalo desde o último estudo ≤ 1 dia → normal.
* 2 a 6 dias → mensagem "Bem-vinda de volta. Vamos retomar de onde você parou." Primeira tarefa: revisão curta do
  último tópico estudado. Carga normal do dia, sem acréscimo.
* ≥ 7 dias → **protocolo de retomada (3 missões)**: missão 1 com 75% do tempo e só revisão + questões de diagnóstico
  dos últimos tópicos; missão 2 normal com pouco conteúdo novo; missão 3 normal.
* As revisões vencidas são re-priorizadas a partir de hoje (não empilhadas). A fase é recalculada pelo tempo restante.
  As prioridades usam data atual, tempo até a prova, importância, desempenho, conteúdos não iniciados e revisões.

**Fases** (por tempo restante e desempenho; a fase usada é a mais avançada entre as duas regras):

| Fase | Por tempo | Por desempenho |
|---|---|---|
| F1 Construção da base | início | — |
| F2 Consolidação | ≤ 105 dias | cobertura ponderada do edital ≥ 85% |
| F3 Aprofundamento | ≤ 70 dias | domínio médio dos iniciados ≥ 70% |
| F4 Performance | ≤ 45 dias | — |
| F5 Reta final | ≤ 21 dias (editável) | — |

## 7. Estrutura das telas

| Tela | Conteúdo |
|---|---|
| **Hoje** (inicial) | PROJETO TJSP · faltam X dias · MISSÃO DE HOJE · Começar · tempo disponível · como você está · "Meu momento" (domínio geral, pontos críticos, evolução com evidência, próximo simulado) |
| **Foco** | Só a tarefa atual, cronômetro, instruções, onde estudar, botão Concluir → registro |
| **Registrar questões** | Grade rápida com as 7 classificações; detalhes opcionais do erro (vai para Meus Erros + flashcard) |
| **Mapa de Guerra** | Edital inteiro: disciplina → tema → subtema, com prioridade, status, domínio, questões, acertos, erros, próxima revisão; ficha do tópico com artigos, links, histórico VUNESP, pegadinhas, erros, revisões |
| **Revisar** | Fila de revisões e flashcards do dia |
| **Meus Erros** | Caderno de erros com filtros, ERRO RECORRENTE em destaque |
| **Simulados** | Próximo simulado recomendado, especificação (distribuição, tempo, ordem), registro e relatório automático |
| **Evolução** | Acerto geral/disciplina/tópico, evolução semanal e mensal, TAXA DE RETORNO, RISCO PARA A PROVA, blocos eliminatórios, relatório semanal |
| **DNA VUNESP** | Por disciplina: temas mais cobrados, frequência, forma de cobrança, pegadinhas, exemplos reais, dispositivos repetidos |
| **Redação** | Fase atual (1–5), exercícios, autoavaliação pelos 4 critérios do edital, checagem das regras de anulação |
| **Ajustes** | Configuração completa, distração (contador simbólico), backup, sincronização, fontes |

## 8. Fluxo completo da usuária

```
Abrir o site
  └─► (retorno detectado?) "Bem-vinda de volta…"  ──┐
  └─► Tela Hoje: missão já montada para o tempo padrão do dia
        ├─ ajusta tempo / estado (opcional) → missão recalculada
        └─ COMEÇAR MISSÃO
              └─► Foco: tarefa 1 (aprendizado) → Concluir
              └─► Foco: tarefa 2 (questões no QConcursos) → Concluir → Registrar 7 classificações
              └─► Foco: tarefa 3 (correção ativa) → detalhar erros → flashcards criados
              └─► Foco: tarefa 4 (revisão/flashcards) → Concluir
              └─► MISSÃO CONCLUÍDA (resumo com evidências)
Motor recalcula domínio, revisões e prioridades → missão de amanhã muda sozinha.
1× por semana: relatório semanal + ajuste automático das prioridades.
Simulados entram quando a fase pede; o relatório alimenta o painel de risco.
Navegar muito tempo sem começar → "Você não precisa decidir nada agora. Sua missão já está pronta." [COMEÇAR AGORA]
```

---

## Regras psicológicas (aplicadas em todo texto do sistema)

Proibido: "você está atrasada", "você perdeu X dias", "deveria ter estudado", "seu desempenho está ruim", "não cumpriu a meta".
Usado: "Vamos ajustar", "Esse tópico precisa de reforço", "Hoje vamos fazer uma missão menor", "O projeto continua".
Progresso só aparece com evidência (amostra mínima e comparação com período anterior).

## Dúvidas registradas (não inventadas)

| Ponto | Situação | Fonte a conferir |
|---|---|---|
| Lei 10.261/68 — divisão interna exata dos arts. 1–86 e 239–323 | Temas confirmados pelo estudo (posse/exercício, reintegração, penalidades, prescrição, processo, recursos). Arts. 171–175 = acumulação (busca). Art. 251 = penalidades (busca). Demais números de artigo: conferir. | Texto compilado ALESP / PGE-SP |
| CP art. 326 (violação de sigilo de proposta de concorrência) | Faixa 319–333 do edital inclui o art. 326; fontes indicam que a conduta passou para o art. 337-J (Lei 14.133/2021). Conferir vigência. | Planalto — CP compilado |
| CP art. 335 | Fora do edital e revogado pela Lei 14.133/2021 (estudo). Questão 2018 Q28 não serve. | Estudo Raio-X |
| Improbidade (Lei 8.429/92) | Estudar só pela redação atual (Lei 14.230/2021). Questões 2018 Q58/Q59 e 2021 Q57/Q59 têm gabarito superado. | Estudo Raio-X |
| Normas da Corregedoria — títulos das seções do Tomo I | O edital indica só números de capítulo/seção. Títulos: conferir no site da Corregedoria. | tjsp.jus.br/Corregedoria |
| Pontuação por critério na redação | Edital fixa escala 0–40 e mínimo 24, com 4 critérios; não fixa pontos por critério no trecho lido. A autoavaliação usa 10 por critério como estimativa. | Edital cap. XI |
| Atualidades | Fatos a partir do 1º semestre de 2026 + Estatuto da PcD arts. 1–13 e 34–38. | Anexo VIII |
| Gabaritos das provas anteriores | Cadernos vieram sem gabarito; conferir com gabarito definitivo da VUNESP. | vunesp.com.br |
