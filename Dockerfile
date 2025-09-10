# Imagem base do Node
FROM node:18

# Criar diretório de trabalho
WORKDIR /usr/src/app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install

# Copiar o resto do código
COPY . .

# Expor porta da aplicação
EXPOSE 3000

# Comando padrão
CMD ["npm", "start"]
