# dbclient-backend

API REST para o DBClient — suporta PostgreSQL, MySQL e SQLite.

## Setup

```bash
npm install
cp .env.example .env
npm run dev       # nodemon — porta 3001
```

## Variáveis de ambiente

| Variável      | Padrão                    | Descrição              |
|---------------|---------------------------|------------------------|
| PORT          | 3001                      | Porta do servidor      |
| FRONTEND_URL  | http://localhost:5173     | Origin do CORS         |
| NODE_ENV      | development               |                        |

## Endpoints

### Conexões
| Método | Rota                     | Descrição                      |
|--------|--------------------------|--------------------------------|
| GET    | /api/connections         | Listar conexões ativas         |
| POST   | /api/connections         | Criar nova conexão             |
| POST   | /api/connections/test    | Testar configuração            |
| DELETE | /api/connections/:id     | Encerrar conexão               |

### Schema
| Método | Rota                            | Descrição           |
|--------|---------------------------------|---------------------|
| GET    | /api/schema/:id/schemas         | Listar schemas      |
| GET    | /api/schema/:id/tables?schema=X | Listar tabelas      |
| GET    | /api/schema/:id/columns?schema=X&table=Y | Colunas   |

### Dados / Query
| Método | Rota                                 | Descrição                    |
|--------|--------------------------------------|------------------------------|
| POST   | /api/query/execute                   | Executar SQL livre           |
| GET    | /api/query/table/:id?schema&table    | Dados paginados              |
| POST   | /api/query/table/:id/row             | Inserir linha                |
| PUT    | /api/query/table/:id/row             | Atualizar linha              |
| DELETE | /api/query/table/:id/row             | Deletar linha                |

## Corpo das requisições

### POST /api/connections
```json
{
  "type": "postgresql",
  "name": "Prod DB",
  "host": "localhost",
  "port": "5432",
  "database": "mydb",
  "username": "postgres",
  "password": "secret"
}
```
Para SQLite: `{ "type": "sqlite", "name": "Local", "filename": "/path/to/db.sqlite" }`

### POST /api/query/execute
```json
{ "connectionId": "uuid", "sql": "SELECT * FROM users LIMIT 10" }
```

### POST /api/query/table/:id/row  (Insert)
```json
{ "schema": "public", "table": "users", "data": { "name": "Ana", "email": "ana@mail.com" } }
```

### PUT /api/query/table/:id/row  (Update)
```json
{ "schema": "public", "table": "users", "data": { "name": "Ana Lima" }, "where": { "id": 5 } }
```

### DELETE /api/query/table/:id/row
```json
{ "schema": "public", "table": "users", "where": { "id": 5 } }
```
