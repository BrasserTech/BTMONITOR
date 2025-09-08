# BTMonitor 📊

BTMonitor é uma aplicação desktop para o monitoramento em tempo real de pedidos registrados em uma planilha Google Sheets. A interface foi projetada para ser clara e visível a distância, ideal para painéis de controle e monitores de equipe.

---

## ✨ Tecnologias Utilizadas

* **Electron:** Framework para criar aplicações desktop com tecnologias web.
* **Node.js:** Ambiente de execução para o backend (processo principal) do Electron.
* **React:** Biblioteca para construir a interface do usuário (frontend).
* **TypeScript:** Superset do JavaScript que adiciona tipagem estática.
* **Google Sheets API:** Para ler os dados da planilha de pedidos.
* **(Em breve) Tailwind CSS:** Para a estilização da interface.

---

## 🚀 Começando

Siga estas instruções para configurar e rodar o projeto em sua máquina local.

### Pré-requisitos

* [Node.js](https://nodejs.org/en/) (versão 16 ou superior)
* [Git](https://git-scm.com/)

### Configuração do Ambiente

1.  **Clone o Repositório** (ou simplesmente use a pasta que você já criou):
    ```bash
    git clone [https://seu-repositorio-git.com/btmonitor.git](https://seu-repositorio-git.com/btmonitor.git)
    cd btmonitor
    ```

2.  **Instale as Dependências:**
    Este comando vai ler o `package.json` e baixar todas as bibliotecas necessárias (Electron, React, etc.).
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente (MUITO IMPORTANTE):**
    As chaves secretas para acessar a API do Google Sheets devem ser guardadas de forma segura.

    * Crie uma cópia do arquivo `.env.example` (se existir) ou crie um novo arquivo chamado `.env.local` na raiz do projeto.
    * Adicione as seguintes variáveis a ele, preenchendo com suas credenciais:

    ```
    # .env.local
    GOOGLE_SHEET_ID=SEU_ID_DA_PLANILHA_AQUI
    GOOGLE_SERVICE_ACCOUNT_EMAIL=o-email-da-sua-conta-de-servico@....gserviceaccount.com
    GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA_AQUI\n-----END PRIVATE KEY-----\n"
    ```
    * **Este arquivo `.env.local` nunca deve ser compartilhado ou enviado para o GitHub.**

---

## 💻 Como Usar o Projeto

### Modo de Desenvolvimento (Para testar e codificar)

Para rodar a aplicação em modo de desenvolvimento, use o comando:
```bash
npm start

Para gerar a build
npm run make


gerar portable
npm run clean
npm install
npm run build:portable