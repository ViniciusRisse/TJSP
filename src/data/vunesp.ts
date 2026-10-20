// DNA VUNESP — padrões extraídos do estudo "Raio-X VUNESP – Escrevente TJSP" (20/10/2026).
// Exemplos citam a prova e a questão (cadernos 2018 tjsp1704, 2021 TJSP2101, 2025 TJSP2503).

import type { Material, VunespPattern } from '../types';
import { LINKS } from './edital';

export const DEFAULT_PATTERNS: VunespPattern[] = [
  {
    id: 'instituto-vizinho', name: 'Instituto vizinho trocado',
    how: 'A regra está certa, mas com o nome do instituto ao lado.',
    examples: [
      'Impedimento × suspeição do juiz (2018 Q31, 2021 Q31, 2025 Q21)',
      'Posse fora do prazo torna a nomeação sem efeito; exercício fora do prazo gera exoneração (2025 Q37)',
      'Concussão × corrupção passiva (2018 Q27)',
      'Pronúncia (recurso em sentido estrito) × impronúncia (apelação) (2021 Q34)',
      'STF × STJ no cargo privativo de brasileiro nato (2018 Q47)',
    ],
    defense: 'Estudar em pares, com quadro comparativo.',
    disciplines: ['penal', 'ppenal', 'pcivil', 'const', 'estatuto'],
  },
  {
    id: 'numero', name: 'Número trocado',
    how: 'Prazo, grau de parentesco, percentual ou quantidade alterados.',
    examples: [
      'Juízos coletivos: 3º grau virou 4º (2018 Q31)',
      'Noivos: 3 dias viraram 5 (2021 Q39)',
      'Edital no CPP: 15 dias viraram 120 (2025 Q23)',
      'Apelação no Juizado Criminal: 10 dias viraram 15 (2025 Q25)',
      'Senha do processo digital: 24h virou 48h (2018 Q64)',
    ],
    defense: 'Flashcards só de números, por lei.',
    disciplines: ['ppenal', 'pcivil', 'interna', 'estatuto'],
  },
  {
    id: 'condicao-inventada', name: 'Condição inventada',
    how: '"desde que", "somente" ou "mediante" que a lei não tem.',
    examples: [
      '"desde que haja requerimento do MP" (2025 Q24)',
      '"desde que mediante requerimento" (2025 Q27)',
      '"desde que os embargos sejam admitidos" (2021 Q42)',
      '"somente mediante queixa" (2021 Q30)',
    ],
    defense: 'Desconfiar de toda restrição extra.',
    disciplines: ['ppenal', 'pcivil', 'penal'],
  },
  {
    id: 'regra-excecao', name: 'Regra e exceção invertidas',
    how: '"exceto" no lugar de "inclusive"; "facultado" no lugar de "dever".',
    examples: [
      'Estatuto da PcD: a restrição ao trabalho é vedada inclusive no recrutamento (2021 Q70)',
      'Comunicar violação é dever de todos (2021 Q69)',
      '"não cabe reconsideração" do Governador (2018 Q55, 2021 Q56)',
    ],
    defense: 'Marcar salvo, exceto e inclusive na lei seca.',
    disciplines: ['atual', 'estatuto', 'const'],
  },
  {
    id: 'paragrafo', name: 'Parágrafo pouco lido',
    how: 'A resposta está num parágrafo que quase ninguém revisa.',
    examples: [
      'Supressão de carimbo, art. 293, § 2º (2025 Q17)',
      'Fraude em certame com dano à Administração, art. 311-A, § 2º (2018 Q26)',
      'Multa no atestado médico falso só com fim de lucro, art. 302 (2018 Q25)',
    ],
    defense: 'Ler todos os parágrafos dos artigos do edital.',
    disciplines: ['penal'],
  },
  {
    id: 'verbo-cortado', name: 'Verbo do tipo cortado',
    how: 'Some um dos verbos do tipo penal.',
    examples: [
      'Art. 313-A: "inserir ou facilitar" e "excluir indevidamente" (2025 Q19)',
      'Art. 311-A sem exigir vantagem (2021 Q29)',
    ],
    defense: 'Decorar os núcleos dos tipos.',
    disciplines: ['penal'],
  },
  {
    id: 'lei-antiga', name: 'Lei antiga',
    how: 'Texto revogado ou anterior à reforma.',
    examples: [
      'Penhora fora do horário não depende mais de autorização judicial (2025 Q26)',
      'Prioridade de tramitação para violência contra a mulher, art. 394-A (2025 Q24): a banca cobrou a redação nova',
      'Improbidade: gabaritos de 2018 Q58/Q59 e 2021 Q57/Q59 superados pela Lei 14.230/21',
    ],
    defense: 'Estudar só pelo texto compilado atual.',
    disciplines: ['pcivil', 'ppenal', 'improb'],
  },
  {
    id: 'caso-hipotetico', name: 'Caso hipotético',
    how: 'História longa que se resolve pela letra da lei.',
    examples: ['Casos: cerca de 1 em 40 questões de Direito em 2018, 11 em 40 em 2021 e 19 em 30 em 2025'],
    defense: 'Ler primeiro a pergunta, achar o artigo e só depois a história.',
    disciplines: ['penal', 'ppenal', 'pcivil', 'const', 'estatuto', 'improb'],
  },
  {
    id: 'multiplas-regras', name: 'Uma alternativa, várias regras',
    how: 'A mesma alternativa testa concordância, regência e colocação (2025 Q4); lacunas misturam crase, regência e pronome relativo (2025 Q2).',
    examples: ['2025 Q2 ("à qual … a milhões de pessoas … às")', '2025 Q4', '2021 Q6 e Q23', '2018 Q19'],
    defense: 'Eliminar a alternativa no primeiro erro encontrado.',
    disciplines: ['port'],
  },
  {
    id: 'generalizacao', name: 'Generalização na interpretação',
    how: 'Distratores generalizam ("todos") ou invertem causa e consequência.',
    examples: ['Interpretação 2018–2025'],
    defense: 'Comparar cada palavra da alternativa com o trecho do texto.',
    disciplines: ['port', 'atual'],
  },
  {
    id: 'palavra-inserida', name: 'Palavra inserida que muda o sentido',
    how: 'Uma palavra a mais ("também") altera o que o texto diz.',
    examples: ['2025 Q6 (alternativa B)'],
    defense: 'Desconfiar de advérbios e quantificadores que não estão no texto.',
    disciplines: ['port', 'atual'],
  },
  {
    id: 'paronimo', name: 'Parônimo no antônimo',
    how: 'Distrator parecido com a resposta.',
    examples: ['Antônimo de "implacável" é "compassiva"; o distrator era "impassiva" (2025 Q8)'],
    defense: 'Conferir o sentido, não o som da palavra.',
    disciplines: ['port'],
  },
  {
    id: 'reescrita', name: 'Reescrita de trechos',
    how: 'Gramática cobrada pela reescrita de trechos do próprio texto.',
    examples: ['Português 2025: quase toda a gramática veio por reescrita'],
    defense: 'Checar sentido + correção gramatical em cada reescrita.',
    disciplines: ['port'],
  },
  {
    id: 'detalhe-operacional', name: 'Detalhe operacional',
    how: 'Resultado exato de fórmula ou de uma sequência de cliques/ações.',
    examples: ['Excel: SE com MAIOR/MENOR (2018 Q85 e 2025 Q59)', 'E-mail: quantas mensagens cada um recebe com Responder a todos e Cco (2025 Q60)'],
    defense: 'Reproduzir no computador o que a questão descreve.',
    disciplines: ['info'],
  },
  {
    id: 'conta-exata', name: 'Conta que precisa fechar',
    how: 'Resposta pedida como "algarismo das unidades" (2025 Q51, Q52), o que impede estimativa.',
    examples: ['2025 Q51', '2025 Q52'],
    defense: 'Fazer a conta inteira; não arredondar no meio.',
    disciplines: ['mat', 'rlm'],
  },
];

/** Dispositivos que voltaram quase palavra por palavra (estudo Raio-X). Viram flashcards iniciais. */
export const REPEATED_RULES: { topicId: string; front: string; back: string; ref: string }[] = [
  { topicId: 'pp-juiz', front: 'CPP art. 255: dissolvido o casamento sem filhos, o juiz pode julgar o sogro, padrasto, cunhado, genro ou enteado da parte?', back: 'Não. Mesmo dissolvido o casamento sem descendentes, não funciona como juiz o sogro, padrasto, cunhado, genro ou enteado de quem foi parte.', ref: '2018 Q31 e 2021 Q31' },
  { topicId: 'pp-acus', front: 'CPP art. 266: o defensor indicado pelo acusado no interrogatório precisa de procuração?', back: 'Não. A constituição de defensor independe de instrumento de mandato se o acusado o indicar por ocasião do interrogatório.', ref: '2018 Q32 e 2025 Q22' },
  { topicId: 'pp-jecrim', front: 'Lei 9.099 art. 60, parágrafo único: reunidos os processos no juízo comum (conexão/continência), a transação e a composição dos danos continuam valendo?', back: 'Sim. Observam-se os institutos da transação penal e da composição dos danos civis.', ref: '2018 Q37 e 2021 Q37' },
  { topicId: 'le-reint', front: 'Lei 10.261: servidor absolvido por negativa de autoria — como volta?', back: 'É reintegrado no mesmo cargo, mediante simples comprovação do trânsito em julgado.', ref: '2018 Q52 e 2021 Q52' },
  { topicId: 'le-rec', front: 'Lei 10.261: cabe pedido de reconsideração da decisão do Governador em única instância?', back: 'Cabe. Nas duas provas, a alternativa errada dizia "não cabe".', ref: '2018 Q55 e 2021 Q56' },
  { topicId: 'pc-jefp', front: 'Lei 12.153 art. 3º: o juiz pode deferir cautelares e antecipatórias de ofício?', back: 'Sim — de ofício ou a requerimento das partes, para evitar dano de difícil ou incerta reparação.', ref: '2018 Q43 (correta) e 2021 Q44 (distrator)' },
  { topicId: 'dc-art5', front: 'CF art. 5º: HC e HD são pagos? Na ação popular, o autor paga custas?', back: 'HC e HD são gratuitos. Na ação popular, o autor fica isento de custas e ônus da sucumbência, salvo comprovada má-fé.', ref: '2018 Q50/Q51 e 2025 Q32' },
  { topicId: 'dc-art5', front: 'CF art. 5º, XI: quando se pode entrar na casa sem consentimento?', back: 'Flagrante delito, desastre ou prestar socorro: a qualquer hora. Por determinação judicial: só durante o dia.', ref: '2021 Q46 e 2025 Q31' },
  { topicId: 'le-prov', front: 'Lei 10.261: posse × exercício — prazo e consequência de perder o prazo', back: 'Posse: 30 dias + 30 (prorrogação) → perdeu: nomeação sem efeito. Exercício: 30 + 30 → perdeu: exoneração.', ref: 'Raio-X VUNESP (2025 Q37)' },
  { topicId: 'pp-cit', front: 'CPP: prazo do edital de citação (réu não encontrado)', back: '15 dias (art. 361). Em 2025 Q23 a banca trocou para 120.', ref: '2025 Q23' },
  { topicId: 'pp-jecrim', front: 'Lei 9.099: prazo da apelação no Juizado Especial Criminal', back: '10 dias (art. 82, § 1º). Em 2025 Q25 a banca trocou para 15.', ref: '2025 Q25' },
  { topicId: 'pp-juiz', front: 'CPP art. 253: juízos coletivos — parentesco que impede servir no mesmo processo', back: 'Até o 3º grau, inclusive (consanguíneo ou afim). Em 2018 Q31 a banca trocou para 4º.', ref: '2018 Q31' },
  { topicId: 'pp-rec', front: 'Pronúncia × impronúncia: qual recurso?', back: 'Pronúncia → recurso em sentido estrito. Impronúncia (e absolvição sumária) → apelação.', ref: '2021 Q34' },
];

export const PAST_EXAMS = [
  { year: 2025, code: 'TJSP2503', format: '70 questões + redação, 5h', region: 'Capital (1ª RAJ)', note: 'Mesmo modelo do edital atual — vale como simulado real. Sem gabarito no caderno: conferir com gabarito definitivo VUNESP.' },
  { year: 2021, code: 'TJSP2101', format: '100 questões, 5h', region: 'não indicada', note: 'Banco de questões: válido para Português, Penal, Proc. Penal, Proc. Civil, Constitucional, Lei 10.261 (239–323), Corregedoria. Não usar improbidade (Q57, Q59).' },
  { year: 2018, code: 'tjsp1704', format: '100 questões, 5h', region: 'Interior', note: 'Banco de questões. Não usar improbidade (Q58, Q59) nem a Q28 (art. 335 CP revogado).' },
];

export const EXAM_TIME_PLAN = 'Ensaio sugerido pelo estudo: ~3h30 para as 70 objetivas, 1h15 para a redação e 15 min para a folha de respostas.';

export const DEFAULT_MATERIALS: Material[] = [
  { id: 'm-qc', kind: 'qconcursos', title: 'QConcursos', where: 'Filtro: Banca VUNESP · Órgão TJ-SP · Cargo Escrevente Técnico Judiciário · Assunto do tópico', url: LINKS.QC, free: false, active: true },
  { id: 'm-apostila', kind: 'apostila', title: 'Apostila Nova Concursos — TJSP Escrevente', where: 'Capítulo do tópico indicado na missão', free: false, active: true },
  { id: 'm-planalto', kind: 'lei', title: 'Lei seca — Planalto (CP, CPP, CPC, CF, Leis 9.099, 12.153, 8.429, 13.146)', where: 'Links em cada tópico do Mapa de Guerra', url: 'https://www.planalto.gov.br', free: true, active: true },
  { id: 'm-alesp', kind: 'lei', title: 'Lei seca — ALESP/PGE-SP (Lei 10.261/68, LC 1.111/10)', where: 'Texto compilado', url: LINKS.ALESP, free: true, active: true },
  { id: 'm-tjsp', kind: 'lei', title: 'TJSP — Res. 850/21, Res. 963/25, Regimento Interno, Normas da Corregedoria', where: 'Links oficiais do edital (Anexo VIII)', url: LINKS.NSCGJ, free: true, active: true },
  { id: 'm-provas', kind: 'prova', title: 'Provas anteriores TJSP (2018, 2021, 2025)', where: 'PDFs dos cadernos — a missão indica o número da questão', free: true, active: true },
  { id: 'm-videos', kind: 'video', title: 'Vídeos curtos gratuitos (YouTube)', where: 'Busque "<tema> + VUNESP" e assista um vídeo de até 20 min; pare quando acabar', free: true, active: true },
];

export const ESSAY_TRAINING_THEMES = [
  { theme: 'O envelhecimento da população: entre a capacidade produtiva dos idosos e os desafios de cuidar deles', source: 'Proposta real — TJSP 2025 (TJSP2503)', real: true },
  { theme: 'Violência contra a mulher no Brasil', source: 'Tema de treino (repertório sugerido pelo estudo)', real: false },
  { theme: 'Desigualdade e tributação', source: 'Tema de treino (repertório sugerido pelo estudo)', real: false },
  { theme: 'Saúde mental', source: 'Tema de treino (repertório sugerido pelo estudo)', real: false },
  { theme: 'Tecnologia e trabalho', source: 'Tema de treino (repertório sugerido pelo estudo)', real: false },
  { theme: 'Clima e cidades', source: 'Tema de treino (repertório sugerido pelo estudo)', real: false },
  { theme: 'Demografia e cuidado', source: 'Tema de treino (repertório sugerido pelo estudo)', real: false },
];

/** Regras de anulação e penalização da redação — Edital cap. XI, itens 8 e 10. */
export const ESSAY_RULES = [
  { id: 'tema', label: 'Atendi ao tema (fuga total = nota 0)' },
  { id: 'genero', label: 'Texto dissertativo-argumentativo em prosa (fuga ao gênero = nota 0)' },
  { id: 'tese', label: 'Tese clara (posicionamento) já no 1º parágrafo' },
  { id: 'macro', label: 'Introdução, desenvolvimento e conclusão' },
  { id: 'pessoa', label: 'Sem 1ª pessoa do singular e sem 2ª pessoa' },
  { id: 'autonomia', label: 'Sem citar "o texto I", "a coletânea", "a proposta"' },
  { id: 'copia', label: 'Sem cópia ou paráfrase predominante da coletânea ou de modelos prontos' },
  { id: 'linhas', label: 'Mais de 7 linhas e ao menos 8 linhas autorais contínuas (abaixo disso = nota 0)' },
  { id: 'linhas20', label: 'Mais de 20 linhas (com 20 ou menos, critérios c e d não chegam à nota máxima; 15 ou menos perde 1 ponto)' },
  { id: 'ident', label: 'Sem nome, rubrica, assinatura ou marca que identifique (nota 0)' },
  { id: 'caneta', label: 'Caneta preta (ou azul-escura); sem corretivo e sem marca-texto' },
  { id: 'paragrafos', label: 'Parágrafos bem divididos (sem monobloco; sem parágrafos de um só período)' },
  { id: 'repertorio', label: 'Repertório ligado ao tema e à tese (citação solta é penalizada)' },
];

export const ESSAY_PHASES = [
  { phase: 1, name: 'Leitura e tese', task: 'Ler uma coletânea/editorial e escrever a tese do autor e a sua em 2–3 linhas.', minutes: 20 },
  { phase: 2, name: 'Argumentação curta', task: 'Escrever 1 parágrafo argumentativo (tópico frasal + argumento + exemplo/repertório).', minutes: 25 },
  { phase: 3, name: 'Introdução e desenvolvimento', task: 'Escrever introdução com tese + 1 parágrafo de desenvolvimento completo.', minutes: 40 },
  { phase: 4, name: 'Redação completa', task: 'Redação completa de 25 a 30 linhas, à mão, com autoavaliação pelos critérios.', minutes: 75 },
  { phase: 5, name: 'Simulado no tempo', task: 'Redação completa em 1h15, em folha de 33 linhas, sem consulta.', minutes: 75 },
];
