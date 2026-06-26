# Documentação — ITC RouteMap

Sistema de alocação inteligente de técnicos para Unidades de Medição (UMs) do Grupo ITC Brasil.

---

## Índice

| # | Documento | Conteúdo |
|---|-----------|----------|
| — | **Este arquivo** | Índice geral e convenções |
| 01 | [Visão Geral](01-visao-geral.md) | Propósito, glossário, fluxo de valor |
| 02 | [Arquitetura](02-arquitetura.md) | Stack, estrutura de pastas, decisões técnicas |
| 03 | [Manual do Usuário](03-manual-usuario.md) | Passo a passo para operadores do sistema |
| 04 | [Telas e Funcionalidades](04-telas-e-funcionalidades.md) | Cada página descrita em detalhe |
| 05 | [Algoritmo e IA](05-algoritmo-e-ia.md) | Algoritmo Húngaro + Gemini 2.5 Flash |
| 06 | [APIs Externas](06-apis-externas.md) | Google Routes Matrix, Routes Single, Maps Embed |
| 07 | [Banco de Dados](07-banco-de-dados.md) | Firestore: coleções, tipos, índices, regras |
| 08 | [Deploy e Infraestrutura](08-deploy-e-infraestrutura.md) | Vercel, Firebase, variáveis de ambiente |
| 09 | [Testes](09-testes.md) | Playwright E2E — plano, estrutura, execução |
| 10 | [Histórico de Alterações](10-historico-de-alteracoes.md) | Changelog por fase do projeto |
| 11 | [Solução de Problemas](11-solucao-de-problemas.md) | Erros comuns e como resolver |

---

## Versão atual

| Item | Valor |
|------|-------|
| Aplicação | `0.1.0` |
| Next.js | `16.2.6` |
| React | `19.2.4` |
| Firebase | `12.13.0` |
| Firebase Admin | `13.10.0` |
| Gemini SDK | `@google/genai 2.8.0` |
| Algoritmo | `munkres-js 1.2.2` |

---

## Convenções desta documentação

- **UM** — Unidade de Medição (ponto de trabalho do técnico)
- **RA** — Região Administrativa
- **Lote** — conjunto de N rotas geradas em um único cálculo
- Nomes de exemplo usados nos fluxos: técnicos *Anne* e *Allan*; UM *BSBIA01*
- Código de exemplo segue TypeScript; trechos de terminal usam `$` como prompt
- Caminhos de arquivo são sempre relativos à raiz do repositório
