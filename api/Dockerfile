FROM node:18.17.0
RUN npm cache clean --force
WORKDIR /api


COPY package.json ./
 
RUN npm install
 
COPY . .
 
CMD [ "node", "app.js" ]