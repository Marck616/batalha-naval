# ⚓ Batalha Naval - Times

Jogo de batalha naval multiplayer em times, pronto para deploy no Render.

## Como fazer deploy no Render

### Opção 1: Deploy automático (GitHub)

1. Crie um repositório no GitHub e suba esses arquivos
2. No Render, clique em **New → Web Service**
3. Conecte seu repositório GitHub
4. O Render detectará o `render.yaml` automaticamente
5. Clique em **Deploy**

### Opção 2: Deploy manual

1. No Render, clique em **New → Web Service**
2. Escolha **Build and deploy from a Git repository** ou faça upload do código
3. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Clique em **Deploy**

## Como jogar

1. O primeiro jogador a acessar vira o ADM
2. O ADM configura a distribuição dos times e a duração
3. Jogadores escolhem nome, cor e time
4. ADM clica em **Iniciar Batalha**
5. Na sua vez: escolha se quer mover navios (até 2) ou atirar direto (3 disparos)

## Regras resumidas

- **Embarcações**: Porta-aviões (6), Couraçado (5), Cruzador (4), Destroyer (2), Submarino (1)
- **Movimentação**: até 2 navios por turno, nas 4 direções, sem girar
- **Disparos**: sempre 3 por turno
- **Fila**: intercalada entre times; se for atingido, passa na frente para se defender
- **Vitória**: destruir todos os navios inimigos ou ter mais navios no fim do tempo

## Estrutura

```
batalha-naval-times/
├── server.js          # Servidor Node.js + Socket.IO
├── package.json       # Dependências
├── render.yaml        # Configuração do Render
└── public/            # Frontend
    ├── index.html
    ├── style.css
    └── client.js
```

## Tecnologias

- Node.js + Express
- Socket.IO (tempo real)
- HTML/CSS/JS (frontend responsivo)
