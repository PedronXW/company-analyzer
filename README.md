# Company Analyzer Hub

Hub independente para consolidar sinais de análise de empresas e calcular scores fundamentais.

## Estrutura

```
src/
├── prisma/
│   └── prisma.service.ts      # Service de conexão com Prisma
├── signal/
│   ├── dto/
│   │   └── market-signal.dto.ts   # DTO de entrada (MarketSignalDTO)
│   ├── signal.controller.ts        # Controller com endpoint POST /signals
│   └── orchestrator.service.ts     # Service de orquestração
└── snapshot/
    └── daily-snapshot-job.service.ts  # Job diário de replicação
```

## Schema Prisma

Tabela `AssetStateSnapshot`:
- `id` (UUID, auto)
- `assetTicker` (String, index)
- `timestamp` (DateTime)
- `sentimentScore` (Float, -1 a 1)
- `fundamentalScore` (Float, -1 a 1)
- `priceActionScore` (Float, -1 a 1)
- `consolidatedScore` (Float, -1 a 1)
- `triggerSource` (Enum: SENTIMENT, FUNDAMENTAL, PRICE)
- `triggerReason` (Text)
- `weightsUsed` (Json)

## DTO de Entrada - MarketSignalDTO

```typescript
{
  ticker: string;        // Ex: "AAPL"
  source: SignalSource;  // SENTIMENT, FUNDAMENTAL, PRICE
  score: number;         // Number entre -1 e 1
  reasoning?: string;    // Opcional
}
```

## Lógica de Orquestração

1. **Recebe sinal** via POST /signals
2. **Busca último snapshot** do ativo
3. **Mantém scores** das fontes que não enviaram sinal
4. **Atualiza** apenas a fonte que enviou o sinal
5. **Calcula consolidatedScore** = média ponderada:
   - Sentimento: 40%
   - Fundamentos: 40%
   - Preço: 20%
6. **Salva novo snapshot** no banco

## Daily Snapshot Job

O `DailySnapshotJob` roda automaticamente todos os dias às 18:05 (após o fechamento do mercado) e:

- Busca todos os tickers únicos no banco de dados usando `groupBy` (otimizado para grandes volumes)
- Para cada ticker, replica o último estado conhecido (sentimentScore, fundamentalScore, priceActionScore, consolidatedScore)
- **Integra com Yahoo Finance (B3)** para capturar o preço real de fechamento do mercado (sufixo `.SA`)
- **Calcula variação percentual** entre o preço atual e o anterior para determinar o `priceActionScore`
- Cria uma nova 'Photo' com `triggerSource: PRICE` e `triggerReason` formatado com a variação percentual

**Lógica de Score de Preço:**
- Fórmula: `((Preço_Atual / Preço_Anterior) - 1) * 10`
- Mantém o score anterior como referência da tendência
- Normaliza para escala -1 a 1

**Objetivo:** Garantir uma linha do tempo completa para cada ativo, facilitando a criação de gráficos e análises históricas futuras.

## Configuração

1. Configure `.env` com `DATABASE_URL`
2. Gere o banco: `npx prisma db push`
3. Inicie: `npm run start:dev`

## Endpoint

```bash
POST http://localhost:3000/signals
Content-Type: application/json

{
  "ticker": "AAPL",
  "source": "SENTIMENT",
  "score": 0.8,
  "reasoning": "Volume de notícias positivas"
}
```

## Exemplo de Resposta

```json
{
  "status": "success",
  "message": "Sinal processado com sucesso",
  "data": {
    "snapshot": {
      "id": "uuid...",
      "assetTicker": "AAPL",
      "timestamp": "2026-05-02T...",
      "sentimentScore": 0.8,
      "fundamentalScore": 0.5,
      "priceActionScore": 0.3,
      "consolidatedScore": 0.5,
      "triggerSource": "SENTIMENT",
      "triggerReason": "Volume de notícias positivas",
      "weightsUsed": {
        "sentiment": 0.4,
        "fundamental": 0.4,
        "price": 0.2
      }
    }
  }
}
```

## Scripts

- `npm run build` - Compila o projeto
- `npm run start:dev` - Inicia em modo development
- `npx prisma db push` - Cria/atualiza o banco de dados
# company-analyzer
