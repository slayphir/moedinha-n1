# 📦 Guia de Instalação - Sistema Financeiro com IA

## 📋 Pré-requisitos

1. **Python 3.8 ou superior**
   - Download: https://www.python.org/downloads/
   - ⚠️ **IMPORTANTE**: Durante a instalação, marque a opção "Add Python to PATH"

2. **Chave da API Google Gemini**
   - Obtenha em: https://makersuite.google.com/app/apikey
   - A chave já está configurada no arquivo `.env`

## 🚀 Instalação Rápida (Windows)

### Opção 1: Script Automático (Recomendado)

1. Clique duas vezes em `install.bat`
2. Aguarde a instalação das dependências
3. Quando concluir, execute `run.bat` para iniciar o sistema
4. Acesse http://localhost:8000 no seu navegador

### Opção 2: Manual

1. Abra o PowerShell ou CMD nesta pasta

2. Crie um ambiente virtual:
```bash
python -m venv venv
```

3. Ative o ambiente virtual:
```bash
venv\Scripts\activate
```

4. Instale as dependências:
```bash
pip install -r requirements.txt
```

5. Inicie o servidor:
```bash
python -m uvicorn backend.app:app --reload
```

6. Acesse http://localhost:8000

## 🐧 Instalação (Linux/Mac)

1. Abra o terminal nesta pasta

2. Crie um ambiente virtual:
```bash
python3 -m venv venv
```

3. Ative o ambiente virtual:
```bash
source venv/bin/activate
```

4. Instale as dependências:
```bash
pip install -r requirements.txt
```

5. Inicie o servidor:
```bash
python -m uvicorn backend.app:app --reload
```

6. Acesse http://localhost:8000

## ⚙️ Configuração da Chave Gemini

A chave da API Gemini já está configurada no arquivo `.env`. 

Se você precisar usar outra chave:

1. Abra o arquivo `.env` com um editor de texto
2. Localize a linha `GEMINI_API_KEY=...`
3. Substitua pela sua chave
4. Salve o arquivo

## 🎯 Primeiros Passos

Após iniciar o sistema:

1. **Crie Categorias**
   - Acesse "Categorias" no menu
   - Clique em "Criar Padrões" para categorias iniciais

2. **Adicione Transações**
   - No Dashboard, clique em "Nova Transação"
   - Ou importe uma planilha em "Importar/Exportar"

3. **Execute uma Análise**
   - No Dashboard, clique em "Executar Análise IA"
   - Aguarde alguns segundos para ver os insights

## 🔍 Verificando a Instalação

Para verificar se tudo está funcionando:

1. Acesse http://localhost:8000/health
   - Deve retornar: `{"status":"ok","message":"Sistema Financeiro API está funcionando!"}`

2. Acesse http://localhost:8000/docs
   - Documentação interativa da API (Swagger)

## ❗ Problemas Comuns

### Python não encontrado
- Certifique-se de que Python está instalado
- Verifique se está no PATH (execute `python --version`)
- No Windows, reinicie o terminal após instalar Python

### Erro ao instalar dependências
- Atualize o pip: `python -m pip install --upgrade pip`
- Tente instalar novamente

### Porta 8000 já em uso
- Mude a porta no arquivo `.env`: `APP_PORT=8001`
- Ou finalize o processo que está usando a porta

### Erro com Gemini API
- Verifique se a chave está correta no arquivo `.env`
- Certifique-se de que tem créditos/acesso à API

## 📞 Suporte

- Consulte o `README.md` para documentação completa
- Verifique os logs do servidor para erros detalhados
- Documentação da API: http://localhost:8000/docs

---

**Boa gestão financeira! 💰📊**

